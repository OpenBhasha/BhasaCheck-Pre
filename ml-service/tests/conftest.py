import os
import sys

os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
