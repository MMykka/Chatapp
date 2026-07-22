import requests

OLLAMA_HOST = "http://localhost:11434"


def check_connection():
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=2)
        data = response.json()          # what turns the response into a Python dict?
        models = data['models']
        if models:
            return True, models[0]['name']   # which key holds the model's name?
        return True, None                    # connected, but no models installed
    except requests.exceptions.RequestException:                            # what exception do you catch for "request failed entirely"?
        return False, None