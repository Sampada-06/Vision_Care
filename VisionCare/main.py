# main.py

import os
import io
import fitz  # PyMuPDF
import docx
from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
app = FastAPI()

# CORS Configuration
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq Client
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("Groq API key not found. Add it to .env")
    client = Groq(api_key=groq_api_key)
except Exception as e:
    print(f"Error initializing Groq client: {e}")
    exit()

# Pick a safe model dynamically

def get_default_model():
    try:
        models = client.models.list()
        # Only pick models that are for chat (exclude whisper, speech, etc.)
        chat_keywords = ["llama", "mixtral", "gemma", "mistral", "chat", "vicuna", "palm", "gpt"]
        for m in models.data:
            if any(kw in m.id.lower() for kw in chat_keywords):
                return m.id
        print("No chat-compatible model found. Available models:", [m.id for m in models.data])
    except Exception as e:
        print("Error fetching models:", e)
    # fallback
    return "llama-3.3-70b-versatile"

DEFAULT_MODEL = get_default_model()

# Pydantic model for chat requests
class ChatRequest(BaseModel):
    message: str

@app.get("/")
async def root():
    return {"message": "VisionCare FastAPI backend is running."}

# Helper: list available models
@app.get("/models/")
async def list_models():
    try:
        models = client.models.list()
        return {"models": [m.id for m in models.data]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching models: {str(e)}")

# AI Chat Endpoint
@app.post("/chat/")
async def handle_chat_message(request: ChatRequest):
    import traceback
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are Saul Goodman, a witty and resourceful AI legal assistant. Provide helpful, concise, and in-character responses."},
                {"role": "user", "content": request.message}
            ],
            model=DEFAULT_MODEL,
        )
        reply = chat_completion.choices[0].message.content
        return {"reply": reply, "model": DEFAULT_MODEL}
    except Exception as e:
        print("Error in /chat/ endpoint:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error during AI chat completion: {str(e)}")

# AI Document Analysis Endpoint
@app.post("/analyze-file/")
async def analyze_document(file: UploadFile = File(...)):
    contents = await file.read()
    filename = file.filename
    text = ""

    # Extract text
    try:
        if filename.endswith(".pdf"):
            with fitz.open(stream=contents, filetype="pdf") as doc:
                text = "".join(page.get_text() for page in doc)
        elif filename.endswith(".docx"):
            with io.BytesIO(contents) as stream:
                doc = docx.Document(stream)
                text = "\n".join([para.text for para in doc.paragraphs])
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        if not text.strip():
            raise HTTPException(status_code=400, detail="No text found in file.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

    # Analyze with AI
    try:
        analysis_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a world-class legal AI assistant. Provide a concise, sharp, and insightful summary of the document."},
                {"role": "user", "content": f"Analyze this document:\n\n---\n{text[:8000]}\n---"},
            ],
            model=DEFAULT_MODEL,
        )
        analysis_result = analysis_completion.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during AI analysis: {str(e)}")

    return {"filename": filename, "analysis": analysis_result, "model": DEFAULT_MODEL}
