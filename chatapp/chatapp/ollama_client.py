import requests

OLLAMA_HOST = "http://localhost:11434"


def check_connection():
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=2)
        data = response.json()          
        models = data['models']
        if models:
            return True, models[0]['name']   
        return True, None                  
    except requests.exceptions.RequestException:                           
        return False, None


def chat_completion(messages, context_chunks=None):
    try:
        if context_chunks:
            context_text = "\n".join(context_chunks)
            system_message = {"role": "system", "content": f"Use the following context to answer the question:\n{context_text}"}
            messages = [system_message] + messages

        payload = {"model": "llama3.2", "messages": messages, "stream": False}
        response = requests.post(f"{OLLAMA_HOST}/api/chat", json=payload, timeout=10)
        print("STATUS:", response.status_code)
        print("BODY:", response.text)
        return response.json()["message"]["content"]
    except requests.exceptions.RequestException as e:
        print("EXCEPTION:", e)
        return "Sorry, I couldn't reach the model right now."                        
   
def get_embedding(text):
    try:
        payload = {"model": "nomic-embed-text", "prompt": text}
        response = requests.post(f"{OLLAMA_HOST}/api/embeddings", json=payload, timeout=30)
        print("STATUS:", response.status_code)
        print("BODY:", response.text[:200])
        return response.json()["embedding"]
    except requests.exceptions.RequestException as e:
        print("EXCEPTION:", e)
        return None