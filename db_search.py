import os
from contextlib import contextmanager
from databricks import sql
from dotenv import load_dotenv

load_dotenv()

_HOST = os.environ["DATABRICKS_HOST"].replace("https://", "").rstrip("/")
_TOKEN = os.environ["DATABRICKS_TOKEN"]
_HTTP_PATH = f"/sql/1.0/warehouses/{os.environ['DATABRICKS_SQL_WAREHOUSE_ID']}"


@contextmanager
def _cursor():
    with sql.connect(server_hostname=_HOST, http_path=_HTTP_PATH, access_token=_TOKEN) as conn:
        with conn.cursor() as cur:
            yield cur


def _rows_to_dicts(cursor):
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def search_by_clinic_id(clinic_ids: str | list[str]) -> list[dict]:
    """Return all chunks for one or more clinic_ids."""
    ids = [clinic_ids] if isinstance(clinic_ids, str) else clinic_ids
    placeholders = ", ".join("?" * len(ids))
    with _cursor() as cur:
        cur.execute(
            f"SELECT * FROM clinic_chunks WHERE clinic_id IN ({placeholders})",
            ids,
        )
        return _rows_to_dicts(cur)


if __name__ == "__main__":
    import pprint
    pprint.pprint(search_by_clinic_id(["clinic_00001", "clinic_00002", "clinic_00003","clinic_00016", "clinic_00013","clinic_00012", "clinic_00092"]))
