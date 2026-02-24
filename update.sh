#!/bin/bash
# This script decodes the new index.html
cd /Users/k_ncube/Documents/jet-driver-portal
cat index_b64.txt | base64 -d > index.html
rm index_b64.txt
rm update.sh
echo "✅ index.html updated. Now run:"
echo "  git add . && git commit -m 'Fix: pre-compiled JS' && git push"
