FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any are needed (e.g. for build tools, though none should be needed for tiktoken since prebuilt wheels exist)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run FastAPI app
CMD ["python", "main.py"]
