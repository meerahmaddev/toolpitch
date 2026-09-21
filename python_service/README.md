# Convertify Python Microservice

This microservice handles heavy conversions including:
- **Office to PDF / PDF to Office**: Word, Excel, PPT (via LibreOffice & pdf2docx)
- **PDF Compression**: High quality compression (via Ghostscript)
- **Voice Tools**: Text-to-Speech & Speech-to-Text (via edge-tts & faster-whisper)

---

## 🚀 How to Run Locally

### 1. Navigate to this folder
```bash
cd python_service
```

### 2. Create and Activate Virtual Environment
```bash
# Windows:
python -m venv venv
venv\Scripts\activate

# Mac/Linux:
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3b. Ghostscript (required for compress-pdf and PDF thumbnails)
`GHOSTSCRIPT_PATH` defaults to `gs`, which only resolves on Linux (where the Dockerfile
installs it via `apt-get install ghostscript`). On Windows/Mac, [install Ghostscript](https://ghostscript.com/releases/gsdnld.html)
and point `GHOSTSCRIPT_PATH` at the actual binary before starting the service, e.g. in
PowerShell:
```powershell
$env:GHOSTSCRIPT_PATH = "C:\Program Files\gs\gs10.04.0\bin\gswin64c.exe"
```
Without this, compress-pdf fails on every request and the console prints a
`[startup] WARNING: Ghostscript binary '...' not found on PATH` line - if you see that,
this is why.

### 4. Start the Service (Port 8001)
```bash
uvicorn main:app --port 8001 --reload
```
*Or directly:*
```bash
python main.py
```

### 5. Verify it's running
Open `http://127.0.0.1:8001/` in your browser. You should see:
```json
{"message": "Python Microservice is running!"}
```
