import os
import io
import fitz  # PyMuPDF
import docx
import requests

from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from groq import Groq

# --------------------------------------
# Load environment variables
# --------------------------------------
load_dotenv()

app = FastAPI()

# --------------------------------------
# CORS CONFIG
# --------------------------------------
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------
# Initialize Groq Client
# --------------------------------------
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("Groq API key missing. Add it to .env")

    client = Groq(api_key=groq_api_key)

except Exception as e:
    print(f"Error initializing Groq client: {e}")
    exit()


# --------------------------------------
# PICK DEFAULT MODEL
# --------------------------------------
def get_default_model():
    try:
        models = client.models.list()
        chat_keywords = ["llama", "mixtral", "gemma", "mistral", "chat", "vicuna"]

        for m in models.data:
            if any(kw in m.id.lower() for kw in chat_keywords):
                return m.id

    except Exception as e:
        print("Error fetching models:", e)

    return "llama-3.3-70b-versatile"


DEFAULT_MODEL = get_default_model()

# --------------------------------------
# Pydantic Models
# --------------------------------------
class ChatRequest(BaseModel):
    message: str


# --------------------------------------
# ROOT
# --------------------------------------
@app.get("/")
def home():
    return {"message": "VisionCare backend running successfully (OSM Version)."}


# ============================================================
# ⭐ OSM DOCTOR FINDER — NO GOOGLE NEEDED ⭐
# ============================================================
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

@app.get("/api/doctor-finder/nearby")
def doctor_finder_osm(lat: float, lng: float, radius: int = 5000):
    """
    Finds nearby eye doctors, optometrists, clinics, hospitals using OSM (OpenStreetMap) data.
    """

    query = f"""
    [out:json][timeout:25];
    (
      node["healthcare"="doctor"](around:{radius},{lat},{lng});
      node["healthcare"="optometrist"](around:{radius},{lat},{lng});
      node["medical_specialty"="ophthalmology"](around:{radius},{lat},{lng});
      node["amenity"="clinic"](around:{radius},{lat},{lng});
      node["amenity"="hospital"](around:{radius},{lat},{lng});
    );
    out body;
    """

    response = requests.post(OVERPASS_URL, data={"data": query})

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="OSM Overpass API request failed")

    data = response.json()

    doctors = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})

        doctors.append({
            "name": tags.get("name", "Unknown"),
            "address": tags.get("addr:full") or tags.get("addr:street") or "Address not available",
            "type": tags.get("healthcare") or tags.get("amenity") or "Clinic",
            "lat": element.get("lat"),
            "lng": element.get("lon")
        })

    return {"count": len(doctors), "results": doctors}


# ============================================================
# AI ENDPOINTS (UNCHANGED)
# ============================================================

@app.post("/chat/")
async def handle_chat_message(request: ChatRequest):
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system",
                 "content": "You are Saul Goodman, a witty legal AI assistant. Provide helpful, fast responses."},
                {"role": "user", "content": request.message}
            ],
            model=DEFAULT_MODEL,
        )

        reply = chat_completion.choices[0].message.content
        return {"reply": reply, "model": DEFAULT_MODEL}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze-file/")
async def analyze_document(file: UploadFile = File(...)):
    contents = await file.read()
    filename = file.filename
    text = ""

    try:
        if filename.endswith(".pdf"):
            with fitz.open(stream=contents, filetype="pdf") as doc:
                text = "".join(page.get_text() for page in doc)

        elif filename.endswith(".docx"):
            with io.BytesIO(contents) as stream:
                doc_file = docx.Document(stream)
                text = "\n".join([p.text for p in doc_file.paragraphs])

        else:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {e}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found.")

    try:
        analysis = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "Summarize this document professionally."},
                {"role": "user", "content": text[:8000]}
            ],
            model=DEFAULT_MODEL
        )

        summary = analysis.choices[0].message.content
        return {"filename": filename, "analysis": summary}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Failure: {e}")


# ============================================================
# END OF FILE
# ============================================================
