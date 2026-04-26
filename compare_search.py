"""Sanity-check the new embeddings vs the old ones, side by side.

Runs the same query against:
  - old: collection 'clinics_rag'      (text-embedding-3-small, no camelCase split, no description, no weighting)
  - new: collection 'clinics_rag_v2'   (text-embedding-3-large, expanded specialties, description, weighted clinical block)

Prints the top-N hits for each so we can eyeball whether ranking actually improved.
"""

import os
from dotenv import load_dotenv
import chromadb
from openai import OpenAI

load_dotenv()


OLD_COLLECTION = "clinics_rag"
OLD_MODEL = "text-embedding-3-small"

NEW_COLLECTION = "clinics_rag_v2"
NEW_MODEL = "text-embedding-3-large"

TOP_N = 5


# Trick queries designed to expose weaknesses:
#  - acronyms (ACL) that don't appear literally anywhere in specialties
#  - layperson phrasing ("knee replacement after a sports injury")
#  - city-tied queries that should NOT cause a wrong-specialty clinic to surface
#  - ambiguous queries (just "eye problem") to see if it pulls ophthalmology over generic clinics
#  - cross-domain bait ("dental cataract surgery") to see if the model gets confused
QUERIES = [
    "I need ACL surgery",
    "knee replacement after a sports injury in Mumbai",
    "cataract surgery in Noida",
    "I have severe tooth pain, need a root canal",
    "eye problem, blurry vision and possibly glaucoma",
    "dental cataract surgery",  # nonsense bait
    "IVF and fertility treatment",
    "skin clinic for laser hair removal in Hyderabad",
    "MRI scan and orthopedic consultation",
    "heart specialist for chest pain",
]


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def get_chroma_client():
    return chromadb.CloudClient(
        cloud_port=443,
        cloud_host="europe-west1.gcp.trychroma.com",
        api_key=os.environ["CHROMA_API_KEY"],
        tenant=os.environ["CHROMA_TENANT"],
        database=os.environ["CHROMA_DATABASE"],
    )


def embed(client: OpenAI, model: str, text: str) -> list[float]:
    res = client.embeddings.create(model=model, input=[text])
    return res.data[0].embedding


def query_collection(collection, query_emb: list[float], n: int):
    return collection.query(
        query_embeddings=[query_emb],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )


def short_hit(meta: dict, distance: float) -> str:
    name = meta.get("name", "?")
    city = meta.get("address_city", "?")
    state = meta.get("address_stateOrRegion", "")
    facility = meta.get("facilityTypeId", "")
    location = f"{city}, {state}".strip(", ")
    return f"  dist={distance:.4f}  {name}  ({location})  [{facility}]"


def run():
    openai_client = get_openai_client()
    chroma_client = get_chroma_client()

    old_collection = chroma_client.get_collection(OLD_COLLECTION)
    new_collection = chroma_client.get_collection(NEW_COLLECTION)

    for query in QUERIES:
        print("\n" + "=" * 88)
        print(f"QUERY: {query}")
        print("=" * 88)

        old_emb = embed(openai_client, OLD_MODEL, query)
        new_emb = embed(openai_client, NEW_MODEL, query)

        old_res = query_collection(old_collection, old_emb, TOP_N)
        new_res = query_collection(new_collection, new_emb, TOP_N)

        print(f"\n[OLD: {OLD_COLLECTION} / {OLD_MODEL}]")
        for i in range(len(old_res["ids"][0])):
            print(short_hit(old_res["metadatas"][0][i], old_res["distances"][0][i]))

        print(f"\n[NEW: {NEW_COLLECTION} / {NEW_MODEL}]")
        for i in range(len(new_res["ids"][0])):
            print(short_hit(new_res["metadatas"][0][i], new_res["distances"][0][i]))


if __name__ == "__main__":
    run()
