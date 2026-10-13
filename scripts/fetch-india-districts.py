import json
import os
import re
import getpass
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = (
    "https://api.data.gov.in/resource/"
    "37231365-78ba-44d5-ac22-3deec40b9197"
)
OUTPUT = Path("src/data/india-locations/districts.json")
LIMIT = 1000

api_key = os.environ.get("DATA_GOV_API_KEY")
if not api_key:
    api_key = getpass.getpass("data.gov.in API key: ")

def normalize_key(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())

def get_field(record, aliases):
    fields = {normalize_key(k): v for k, v in record.items()}
    for alias in aliases:
        value = fields.get(normalize_key(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return None

def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")

def fetch_page(offset):
    params = {
        "api-key": api_key,
        "format": "json",
        "offset": offset,
        "limit": LIMIT,
    }
    url = API_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url, headers={"User-Agent": "DivyaDhara-Location-Importer/1.0"}
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)

    if not isinstance(payload, dict):
        raise ValueError("API response JSON object nahi hai.")

    if payload.get("error") or payload.get("message") == "Invalid API Key":
        raise ValueError(f"API error: {payload}")

    records = payload.get("records")
    if not isinstance(records, list):
        raise ValueError(
            "API response mein 'records' list nahi mili. "
            f"Response keys: {list(payload.keys())}"
        )

    return payload, records

all_records = []
offset = 0
total = None

print("Official district dataset download ho raha hai...")

while True:
    payload, records = fetch_page(offset)

    if total is None:
        try:
            total = int(payload.get("total", 0))
        except (TypeError, ValueError):
            total = 0

    if not records:
        break

    all_records.extend(records)
    print(f"Fetched: {len(all_records)} records")

    offset += len(records)

    if total and offset >= total:
        break
    if len(records) < LIMIT:
        break

if not all_records:
    raise SystemExit("API se koi district record nahi mila; file nahi banayi.")

# API field names resource ke version ke hisaab se alag ho sakte hain.
sample = all_records[0]

district_aliases = [
    "district_name", "districtname", "district", "district_nm"
]
district_code_aliases = [
    "district_lgd_code", "districtlgdcode",
    "district_code", "districtcode", "lgd_district_code"
]
state_aliases = ["state_name", "statename", "state", "state_nm"]
state_code_aliases = [
    "state_lgd_code", "statelgdcode",
    "state_code", "statecode", "lgd_state_code"
]

district_name = get_field(sample, district_aliases)
district_code = get_field(sample, district_code_aliases)
state_name = get_field(sample, state_aliases)
state_code = get_field(sample, state_code_aliases)

if not all([district_name, district_code, state_name, state_code]):
    print("\nAPI ke actual field names:")
    print(json.dumps(list(sample.keys()), indent=2, ensure_ascii=False))
    raise SystemExit(
        "\nField mapping verify karni hogi. districts.json ko overwrite nahi kiya."
    )

districts = []
seen = set()

for record in all_records:
    name = get_field(record, district_aliases)
    code = get_field(record, district_code_aliases)
    state = get_field(record, state_aliases)
    state_lgd = get_field(record, state_code_aliases)

    if not all([name, code, state, state_lgd]):
        continue

    identity = (str(code), str(state_lgd))
    if identity in seen:
        continue
    seen.add(identity)

    districts.append({
        "lgdCode": str(code),
        "name": name,
        "stateLgdCode": str(state_lgd),
        "stateName": state,
        "stateCode": slug(state),
    })

districts.sort(key=lambda d: (d["stateName"], d["name"]))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(districts, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"\nSuccess: {len(districts)} districts saved.")
print(f"File: {OUTPUT}")
print("First 3 records:")
print(json.dumps(districts[:3], ensure_ascii=False, indent=2))
