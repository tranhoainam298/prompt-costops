import requests
import time
import sys

url = "http://localhost:8000/v1/prompt/generate"
headers = {"Content-Type": "application/json"}
payload = {
    "raw_prompt": "This is a test prompt to trigger the agentic loop precrime predictor. It must be intercepted."
}

def run_test():
    print("Starting Pre-Crime Interceptor Integration Test on POST /v1/prompt/generate ...")
    
    for i in range(1, 5):
        print(f"\n[Request {i}/4] Sending payload...")
        try:
            response = requests.post(url, json=payload, headers=headers)
            status = response.status_code
            
            if i < 4:
                if status != 200:
                    print(f"FAILED: Expected 200 on attempt {i}, got {status}: {response.text}")
                    sys.exit(1)
                print(f"Attempt {i} successful (HTTP {status}).")
            else:
                if status != 429:
                    print(f"FAILED: Expected 429 on attempt {i}, got {status}: {response.text}")
                    sys.exit(1)
                    
                data = response.json()
                if data.get("error") != "Agentic Loop Detected":
                    print(f"FAILED: Incorrect JSON response: {data}")
                    sys.exit(1)
                    
                print(f"Attempt {i} successfully INTERCEPTED (HTTP 429).")
                print(f"Payload received: {data}")
                
        except Exception as e:
            print(f"FAILED: Connection error - {e}")
            sys.exit(1)
            
        time.sleep(0.5)
        
    print("\nAll integration tests passed! Pre-Crime Predictor is bulletproof.")

if __name__ == "__main__":
    run_test()
