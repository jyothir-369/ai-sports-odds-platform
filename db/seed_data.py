import os
import random
import importlib
import importlib.util
from datetime import datetime, timedelta, timezone


def weighted_rating(player):
    return (
        player["power"] * 0.34
        + player["consistency"] * 0.28
        + player["speed"] * 0.14
        + player["experience"] * 0.12
        + player["stamina"] * 0.12
    )


def auction_price(player):
    base = weighted_rating(player)
    premium = (player["experience"] * 0.4) + random.uniform(-5, 5)
    return round((base + premium) * 110000, 2)


def generate_players(count=100):
    first_names = [
        "Arjun", "Kabir", "Rohan", "Ishaan", "Dev", "Rahul", "Ayan", "Vihaan", "Sameer", "Karan",
        "Liam", "Noah", "Ethan", "Mason", "Lucas", "Aarav", "Mihir", "Nikhil", "Omar", "Rehan"
    ]
    last_names = [
        "Sharma", "Patel", "Khan", "Singh", "Das", "Roy", "Iyer", "Kapoor", "Malik", "Yadav",
        "Brooks", "Turner", "Hayes", "Parker", "Morgan", "Ali", "Mehta", "Rao", "Nair", "Gill"
    ]
    roles = ["Batter", "Bowler", "All-Rounder", "Wicket-Keeper"]

    players = []
    for idx in range(count):
        player = {
            "name": f"{random.choice(first_names)} {random.choice(last_names)} {idx + 1}",
            "role": random.choice(roles),
            "power": random.randint(45, 100),
            "consistency": random.randint(35, 100),
            "speed": random.randint(40, 100),
            "experience": random.randint(20, 100),
            "stamina": random.randint(35, 100),
        }
        player["auction_price"] = auction_price(player)
        player["injured"] = random.random() < 0.08
        players.append(player)

    return players


def assign_auction(players, team_count=8, roster_size=11):
    teams = [
        ("Mumbai Mavericks", "Wankhede Arena"),
        ("Delhi Dynamos", "Capital Dome"),
        ("Chennai Cyclones", "Marina Stadium"),
        ("Bangalore Blazers", "Silicon Oval"),
        ("Kolkata Knights", "Eden Citadel"),
        ("Hyderabad Hawks", "Deccan Grounds"),
        ("Pune Panthers", "Sahyadri Field"),
        ("Ahmedabad Aces", "Sabarmati Park"),
    ][:team_count]

    ranked = sorted(players, key=weighted_rating, reverse=True)
    roster_map = {team_name: [] for team_name, _ in teams}

    draft_order = [team[0] for team in teams]
    pick_direction = 1
    pick_index = 0

    for player in ranked:
        filled_teams = [team for team in draft_order if len(roster_map[team]) < roster_size]
        if not filled_teams:
            break

        if pick_index >= len(draft_order):
            pick_index = 0
            pick_direction *= -1
            draft_order.reverse()

        candidate_team = draft_order[pick_index]
        while len(roster_map[candidate_team]) >= roster_size:
            pick_index = (pick_index + 1) % len(draft_order)
            candidate_team = draft_order[pick_index]

        roster_map[candidate_team].append(player)
        pick_index += 1

    return teams, roster_map


def team_strength(roster):
    if not roster:
        return 0
    return sum(weighted_rating(player) for player in roster) / len(roster)


def simulate_match(score_strength_a, score_strength_b, home_advantage=4):
    adjusted_a = score_strength_a + home_advantage
    win_prob_a = 1 / (1 + pow(2.71828, -((adjusted_a - score_strength_b) / 12)))

    base_a = random.randint(130, 210)
    base_b = random.randint(130, 210)

    if random.random() < win_prob_a:
        base_a += random.randint(8, 25)
        base_b -= random.randint(0, 12)
    else:
        base_b += random.randint(8, 25)
        base_a -= random.randint(0, 12)

    return max(base_a, 80), max(base_b, 80)


def main():
    random.seed(50)
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sports_odds")

    psycopg_spec = importlib.util.find_spec("psycopg")
    if psycopg_spec is None:
        raise RuntimeError("psycopg is required. Install with: pip install psycopg[binary]")

    psycopg = importlib.import_module("psycopg")

    players = generate_players(100)
    teams, roster_map = assign_auction(players)

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM favorites")
            cur.execute("DELETE FROM matches")
            cur.execute("DELETE FROM match_history")
            cur.execute("DELETE FROM rosters")
            cur.execute("DELETE FROM players")
            cur.execute("DELETE FROM teams")

            team_id_by_name = {}
            for team_name, stadium in teams:
                cur.execute(
                    "INSERT INTO teams (name, sport, league, home_stadium) VALUES (%s, %s, %s, %s) RETURNING id",
                    (team_name, "Cricket", "IPL Sim", stadium),
                )
                team_id_by_name[team_name] = cur.fetchone()[0]

            player_id_map = {}
            for player in players:
                cur.execute(
                    """
                    INSERT INTO players
                    (name, role, power, consistency, speed, experience, stamina, auction_price, injured)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        player["name"],
                        player["role"],
                        player["power"],
                        player["consistency"],
                        player["speed"],
                        player["experience"],
                        player["stamina"],
                        player["auction_price"],
                        player["injured"],
                    ),
                )
                player_id_map[player["name"]] = cur.fetchone()[0]

            for team_name, roster in roster_map.items():
                sorted_roster = sorted(roster, key=weighted_rating, reverse=True)
                star_names = {player["name"] for player in sorted_roster[:2]}

                for player in roster:
                    cur.execute(
                        """
                        INSERT INTO rosters (team_id, player_id, is_star, acquired_price)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            team_id_by_name[team_name],
                            player_id_map[player["name"]],
                            player["name"] in star_names,
                            player["auction_price"],
                        ),
                    )

            team_strength_map = {name: team_strength(roster) for name, roster in roster_map.items()}
            team_names = list(team_id_by_name.keys())

            now = datetime.now(timezone.utc)

            for i in range(50):
                team_a_name, team_b_name = random.sample(team_names, 2)
                score_a, score_b = simulate_match(
                    team_strength_map[team_a_name],
                    team_strength_map[team_b_name],
                    home_advantage=4,
                )
                match_time = now - timedelta(days=random.randint(2, 140), hours=random.randint(0, 20))

                cur.execute(
                    """
                    INSERT INTO match_history (team_a, team_b, score_a, score_b, match_date)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        team_id_by_name[team_a_name],
                        team_id_by_name[team_b_name],
                        score_a,
                        score_b,
                        match_time,
                    ),
                )

            for i in range(24):
                home_name, away_name = random.sample(team_names, 2)
                kickoff = now + timedelta(hours=(i + 1) * 8)
                cur.execute(
                    """
                    INSERT INTO matches (sport, league, home_team_id, away_team_id, kickoff_time)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        "Cricket",
                        "IPL Sim",
                        team_id_by_name[home_name],
                        team_id_by_name[away_name],
                        kickoff,
                    ),
                )

    print("Synthetic data generated: 100 players, 8 teams, 50 history matches, 24 upcoming matches")


if __name__ == "__main__":
    main()
