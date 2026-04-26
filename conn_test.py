import os
from databricks import sql
from dotenv import load_dotenv

load_dotenv()

HOST = os.environ["DATABRICKS_HOST"].replace("https://", "").rstrip("/")
TOKEN = os.environ["DATABRICKS_TOKEN"]
WAREHOUSE_ID = os.environ["DATABRICKS_SQL_WAREHOUSE_ID"]
HTTP_PATH = f"/sql/1.0/warehouses/{WAREHOUSE_ID}"

print(f"Connecting to {HOST} ...")

try:
    with sql.connect(
        server_hostname=HOST,
        http_path=HTTP_PATH,
        access_token=TOKEN,
    ) as conn:
        print("Connection established.")

        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS row_count FROM clinic_chunks")
            row = cursor.fetchone()
            print(f"clinic_chunks row count: {row[0]}")

            cursor.execute("SELECT * FROM clinic_chunks LIMIT 3")
            rows = cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            print(f"\nColumns: {cols}")
            print("Sample rows:")
            for r in rows:
                print(dict(zip(cols, r)))

    print("\nConnection test passed.")

except Exception as e:
    print(f"Connection test failed: {e}")
    raise
