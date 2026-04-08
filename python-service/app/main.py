from math import exp
import os
from typing import Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="Z50 Odds AI Service", version="1.0.0")


class GenerateOddsRequest(BaseModel):
    match_id: Optional[int] = None
    teamA: str
    teamB: str
    teamA_rating: float = Field(ge=1, le=100)
    teamB_rating: float = Field(ge=1, le=100)
    volatility: float = Field(default=8.0, ge=0)
    data_points: int = Field(default=0, ge=0)
    head_to_head_count: int = Field(default=0, ge=0)
    star_injuries: int = Field(default=0, ge=0)
    draw_bias: float = Field(default=0.0, ge=-0.1, le=0.1)


class GenerateOddsBatchRequest(BaseModel):
    matches: List[GenerateOddsRequest]


class OddsRequest(BaseModel):
    sport: str
    league: str
    home_team: str
    away_team: str
    home_mean_power: float = Field(ge=0, le=100)
    away_mean_power: float = Field(ge=0, le=100)
    home_consistency_std: float = Field(ge=0)
    away_consistency_std: float = Field(ge=0)
    home_recent_form: float = Field(ge=0, le=1)
    away_recent_form: float = Field(ge=0, le=1)
    home_synergy: float = Field(ge=0, le=100)
    away_synergy: float = Field(ge=0, le=100)
    home_advantage: int = Field(ge=0, le=1)
    head_to_head_count: int = Field(ge=0)
    data_points: int = Field(ge=0)
    home_star_injuries: int = Field(ge=0)
    away_star_injuries: int = Field(ge=0)
    home_top5_consistency: float = Field(ge=0, le=100)
    away_top5_consistency: float = Field(ge=0, le=100)
    key_player_impact: Dict[str, List[dict]]


class ExplainRequest(BaseModel):
    sport: str
    league: str
    home_team: str
    away_team: str
    home_win_probability: float
    away_win_probability: float
    confidence_score: float
    confidence_label: str
    head_to_head_count: int
    power_edge: float
    consistency_edge: float
    key_player_impact: Dict[str, List[dict]]
    key_factors: List[str]


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min(value, max_value), min_value)


def probability_from_matchup(payload: OddsRequest) -> float:
    power_edge = (payload.home_mean_power - payload.away_mean_power) * 0.05
    form_edge = (payload.home_recent_form - payload.away_recent_form) * 18.0
    synergy_edge = (payload.home_synergy - payload.away_synergy) * 0.03
    consistency_edge = (payload.home_top5_consistency - payload.away_top5_consistency) * 0.04
    home_bonus = 3.5 if payload.home_advantage else 0.0
    injury_edge = (payload.away_star_injuries - payload.home_star_injuries) * 2.8

    latent_score = power_edge + form_edge + synergy_edge + consistency_edge + home_bonus + injury_edge
    home_prob = 1 / (1 + exp(-(latent_score / 8.0)))
    return clamp(home_prob, 0.15, 0.85)


def confidence_score(payload: OddsRequest) -> float:
    variance_proxy = ((payload.home_consistency_std + payload.away_consistency_std) / 2) ** 2 + 1
    sample_bonus = payload.data_points + payload.head_to_head_count
    raw_confidence = sample_bonus / variance_proxy

    injury_penalty = 1 + ((payload.home_star_injuries + payload.away_star_injuries) * 0.45)
    normalized = (raw_confidence / 3.2) / injury_penalty

    if sample_bonus < 8:
        normalized *= 0.65

    return clamp(normalized, 0.15, 0.98)


def confidence_label(score: float) -> str:
    if score >= 0.78:
        return "high"
    if score >= 0.55:
        return "medium"
    return "low"


def to_decimal_odds(probability: float) -> float:
    # Add a modest margin to mimic realistic market pricing.
    margin_adjusted = clamp(probability * 0.96, 0.05, 0.95)
    return round(1 / margin_adjusted, 2)


def compute_generate_odds(payload: GenerateOddsRequest) -> dict:
    base_team_a = payload.teamA_rating / (payload.teamA_rating + payload.teamB_rating)
    closeness = clamp(1 - (abs(payload.teamA_rating - payload.teamB_rating) / 100), 0, 1)

    draw_prob = clamp(0.1 + (closeness * 0.12) + payload.draw_bias, 0.08, 0.28)
    team_a_prob = base_team_a * (1 - draw_prob)
    team_b_prob = (1 - base_team_a) * (1 - draw_prob)

    total = team_a_prob + team_b_prob + draw_prob
    team_a_prob /= total
    team_b_prob /= total
    draw_prob /= total

    confidence_raw = (payload.data_points + payload.head_to_head_count + 6) / (max(payload.volatility, 1.0) * 1.6)
    confidence = clamp((confidence_raw / (1 + (payload.star_injuries * 0.25))), 0.25, 0.95)
    risk_factor = "High Volatility" if confidence < 0.65 else "Stable"

    favored = payload.teamA if team_a_prob >= team_b_prob else payload.teamB
    analysis = (
        f"{favored} has the stronger edge. Team metrics indicate a {round(confidence * 100, 1)}% confidence level "
        f"with draw probability at {round(draw_prob * 100, 1)}%."
    )

    result = {
        "teamA": payload.teamA,
        "teamB": payload.teamB,
        "teamA_win_prob": round(team_a_prob, 4),
        "teamB_win_prob": round(team_b_prob, 4),
        "draw_prob": round(draw_prob, 4),
        "odds": {
            "teamA": to_decimal_odds(team_a_prob),
            "teamB": to_decimal_odds(team_b_prob),
            "draw": to_decimal_odds(draw_prob),
        },
        "confidence_score": round(confidence, 4),
        "risk_factor": risk_factor,
        "analysis": analysis,
    }

    if payload.match_id is not None:
        result["match_id"] = payload.match_id

    return result


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ai-service"}


@app.post("/generate-odds")
def generate_odds(payload: GenerateOddsRequest) -> dict:
    return compute_generate_odds(payload)


@app.post("/generate-odds-batch")
def generate_odds_batch(payload: GenerateOddsBatchRequest) -> dict:
    return {"results": [compute_generate_odds(match) for match in payload.matches]}


@app.post("/odds")
def odds(payload: OddsRequest) -> dict:
    home_prob = probability_from_matchup(payload)
    away_prob = round(1 - home_prob, 4)
    home_prob = round(home_prob, 4)

    conf_score = confidence_score(payload)
    confidence = confidence_label(conf_score)

    key_factors = []
    if payload.home_mean_power >= payload.away_mean_power:
        key_factors.append(f"{payload.home_team} has stronger auction-adjusted power")
    else:
        key_factors.append(f"{payload.away_team} has stronger auction-adjusted power")

    if payload.home_recent_form >= payload.away_recent_form:
        key_factors.append(f"{payload.home_team} has better recent form over last 3 games")
    else:
        key_factors.append(f"{payload.away_team} has better recent form over last 3 games")

    if payload.home_top5_consistency >= payload.away_top5_consistency:
        key_factors.append(f"{payload.home_team} has superior top-5 consistency")
    else:
        key_factors.append(f"{payload.away_team} has superior top-5 consistency")

    if payload.home_star_injuries or payload.away_star_injuries:
        key_factors.append("Star-player injuries are suppressing confidence")

    home_impact = payload.key_player_impact.get("home_top_players", [])
    away_impact = payload.key_player_impact.get("away_top_players", [])
    impact_pool = home_impact + away_impact
    strongest = None
    if impact_pool:
        strongest = max(impact_pool, key=lambda p: p.get("power", 0) + p.get("consistency", 0))

    return {
        "home_win_probability": home_prob,
        "away_win_probability": away_prob,
        "home_decimal_odds": to_decimal_odds(home_prob),
        "away_decimal_odds": to_decimal_odds(away_prob),
        "confidence": confidence,
        "confidence_score": round(conf_score, 4),
        "confidence_percentage": round(conf_score * 100, 1),
        "key_player_impact": {
            "home_top_players": home_impact,
            "away_top_players": away_impact,
            "most_impactful_player": strongest,
        },
        "key_factors": key_factors,
    }


@app.post("/explain")
def explain(payload: ExplainRequest) -> dict:
    favorite = payload.home_team if payload.home_win_probability >= payload.away_win_probability else payload.away_team
    favorite_prob = max(payload.home_win_probability, payload.away_win_probability)

    power_statement = (
        f"{payload.home_team} has the higher power profile"
        if payload.power_edge > 0
        else f"{payload.away_team} has the higher power profile"
    )
    consistency_statement = (
        f"{payload.home_team} leads consistency across the top five players"
        if payload.consistency_edge > 0
        else f"{payload.away_team} leads consistency across the top five players"
    )

    impactful_name = None
    impact = payload.key_player_impact.get("most_impactful_player") if payload.key_player_impact else None
    if impact:
        impactful_name = impact.get("name")

    explanation = (
        f"{favorite} has a {round(favorite_prob * 100)}% win probability. "
        f"{power_statement}, while {consistency_statement}. "
        f"Confidence is {round(payload.confidence_score * 100)}% ({payload.confidence_label}) based on {payload.head_to_head_count} historical matchups."
    )

    if impactful_name:
        summary = f"{favorite} is the favorite ({round(favorite_prob * 100)}%). Key impact player: {impactful_name}."
    else:
        summary = f"{favorite} is the favorite ({round(favorite_prob * 100)}%)."

    return {
        "explanation": explanation,
        "summary": summary,
        "confidence_score": round(payload.confidence_score, 4),
        "confidence_label": payload.confidence_label,
        "key_factors": payload.key_factors,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
