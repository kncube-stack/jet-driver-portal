#!/bin/bash
# Run this to update index.html with the pre-compiled version
cd /Users/k_ncube/Documents/jet-driver-portal

# Download the fixed index.html from Claude's build
python3 -c "
import base64, sys
# Read the base64 data and decode
with open('index_b64_parts.txt', 'r') as f:
    data = f.read()
decoded = base64.b64decode(data)
with open('index.html', 'wb') as f:
    f.write(decoded)
print('✅ index.html updated successfully')
print('File size:', len(decoded), 'bytes')
"

# Clean up
rm -f index_b64_parts.txt update_index.sh

# Push to GitHub
git add index.html
git commit -m "Fix: pre-compiled JS, no Babel needed"
git push

echo ""
echo "✅ Done! Vercel will auto-deploy in ~10 seconds."
echo "Visit https://jetportal.co to check."
