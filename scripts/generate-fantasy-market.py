from __future__ import annotations

import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = Path.home() / "Downloads" / "Liga_RK_26_2_precos_e_elos_jogadores.xlsx"
OUTPUT = ROOT / "fantasy" / "assets" / "fantasy-market.js"
CONTENT_JS = ROOT / "assets" / "content.js"

DIVISIONS = {
    "Elite": {
        "key": "elite",
        "asset_folder": "equipes_elite",
        "lane_folders": {"TOP": "top", "JG": "jg", "MID": "mid", "ADC": "adc", "SUP": "sup"},
    },
    "Ascensão": {
        "key": "ascension",
        "asset_folder": "equipes_ascensao",
        "lane_folders": {"TOP": "top", "JG": "jungle", "MID": "mid", "ADC": "adc", "SUP": "sup"},
    },
}

ROLE_INDEX = {"TOP": 1, "JG": 2, "MID": 3, "ADC": 4, "SUP": 5}


def clean(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def normalize_path(value: str) -> str:
    return clean(value).replace("\\", "/")


def natural(value: object) -> int:
    try:
        return int(math.floor(float(value) + 0.5))
    except (TypeError, ValueError):
        return 0


def load_content() -> dict:
    text = CONTENT_JS.read_text(encoding="utf-8")
    match = re.search(r"window\.LIGA_RK_CONTENT\s*=\s*(\{.*\})\s*;\s*$", text, re.S)
    if not match:
        raise RuntimeError("Nao consegui ler assets/content.js")
    return json.loads(match.group(1))


def content_lookups(content: dict, division_key: str) -> tuple[dict, dict]:
    teams = ((content.get("divisions") or {}).get(division_key) or {}).get("teams") or {}
    by_slot = {}
    player_ids = {}
    for slot, team in teams.items():
        tag = clean(team.get("tag") or slot).upper()
        by_slot[clean(slot)] = {
            "name": clean(team.get("name")),
            "tag": tag,
            "logo": normalize_path(team.get("logo") or ""),
        }
        for player in team.get("players") or []:
            role = clean(player.get("lane")).upper()
            player_id = clean(player.get("playerId"))
            if role and player_id:
                player_ids[(clean(slot), role)] = player_id
    return by_slot, player_ids


def player_artwork_path(division_meta: dict, tag: str, role: str) -> str:
    folder = division_meta["lane_folders"].get(role)
    number = ROLE_INDEX.get(role)
    if not folder or not number or not tag:
        return ""
    path = f"assets/uploads/{division_meta['asset_folder']}/jogadores/{folder}/{tag.lower()}_{number}.png"
    return path if (ROOT / "fantasy" / path).exists() else ""


def team_logo_path(division_meta: dict, tag: str, fallback: str) -> str:
    if fallback:
        return fallback
    path = f"assets/uploads/{division_meta['asset_folder']}/{tag.lower()}.png"
    return path if (ROOT / "fantasy" / path).exists() else ""


def build_market(workbook: Path) -> dict:
    content = load_content()
    market: dict[str, list[dict]] = {"elite": [], "ascension": []}

    for sheet, meta in DIVISIONS.items():
        division_key = meta["key"]
        by_slot, player_ids = content_lookups(content, division_key)
        frame = pd.read_excel(workbook, sheet_name=sheet, header=2)
        frame = frame[frame["Jogador"].notna()].copy()

        player_entries: list[dict] = []
        team_prices: dict[tuple[str, str], list[int]] = {}

        for _, row in frame.iterrows():
            slot = clean(row.get("Slot"))
            role = clean(row.get("Posição")).upper()
            tag = clean(row.get("Tag")).upper()
            team_name = clean(row.get("Equipe"))
            content_team = by_slot.get(slot, {})
            logo = team_logo_path(meta, tag, normalize_path(content_team.get("logo", "")))
            price = natural(row.get("Preço sugerido"))
            team_prices.setdefault((slot, tag), []).append(price)
            player_id = player_ids.get((slot, role)) or f"player:{division_key}:{slot}:{role}"
            artwork = player_artwork_path(meta, tag, role)

            player_entries.append({
                "id": player_id,
                "type": "player",
                "role": role,
                "name": clean(row.get("Jogador")),
                "teamName": team_name or clean(content_team.get("name")),
                "teamTag": tag or clean(content_team.get("tag")).upper(),
                "teamSlot": slot,
                "riotId": clean(row.get("Riot ID")),
                "elo": clean(row.get("Elo atual")),
                "tier": clean(row.get("Tier")),
                "opgg": clean(row.get("OP.GG")),
                "captain": clean(row.get("Capitão")).lower() == "sim",
                "logo": logo,
                "artwork": artwork,
                "price": price,
                "average": 0,
            })

        team_entries: list[dict] = []
        for (slot, tag), prices in sorted(team_prices.items()):
            rows = frame[(frame["Slot"].map(clean) == slot) & (frame["Tag"].map(lambda value: clean(value).upper()) == tag)]
            team_name = clean(rows.iloc[0].get("Equipe")) if len(rows) else clean(by_slot.get(slot, {}).get("name"))
            logo = team_logo_path(meta, tag, normalize_path(by_slot.get(slot, {}).get("logo", "")))
            team_price = natural(sum(prices) / 5)
            team_entries.append({
                "id": f"team:{division_key}:{slot}",
                "type": "team",
                "role": "TEAM",
                "name": team_name,
                "teamName": team_name,
                "teamTag": tag,
                "teamSlot": slot,
                "logo": logo,
                "price": team_price,
                "average": 0,
            })

        market[division_key] = player_entries + team_entries

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": workbook.name,
        "divisions": market,
    }


def main() -> None:
    workbook = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_WORKBOOK
    if not workbook.exists():
        raise SystemExit(f"Planilha nao encontrada: {workbook}")
    data = build_market(workbook)
    js = "window.FANTASY_RK_MARKET = "
    js += json.dumps(data, ensure_ascii=False, indent=2)
    js += ";\n"
    OUTPUT.write_text(js, encoding="utf-8")
    print(f"Gerado {OUTPUT.relative_to(ROOT)} com {sum(len(v) for v in data['divisions'].values())} itens.")


if __name__ == "__main__":
    main()
