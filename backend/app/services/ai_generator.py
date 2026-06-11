import threading
from typing import List

class ThreadSafeKeyCycler:
    """
    A thread-safe utility to rotate through a list of Groq API keys
    in a round-robin fashion for parallel draft generation.
    """
    def __init__(self, keys: List[str]):
        self.keys = keys
        self.index = 0
        self.lock = threading.Lock()
        
    def get_next_key(self) -> str:
        if not self.keys:
            raise ValueError("No Groq API keys configured in settings.")
        with self.lock:
            key = self.keys[self.index]
            self.index = (self.index + 1) % len(self.keys)
            return key
