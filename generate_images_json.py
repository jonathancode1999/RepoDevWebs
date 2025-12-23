import os, json

IMG_DIR = "img"
allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

files = []
for name in os.listdir(IMG_DIR):
    low = name.lower()
    if low.startswith("img") and os.path.splitext(low)[1] in allowed:
        files.append(name)

# orden natural: img1, img2, img10...
def keyfn(s):
    import re
    m = re.search(r'(\d+)', s)
    return (int(m.group(1)) if m else 10**9, s.lower())

files.sort(key=keyfn)

out_path = os.path.join(IMG_DIR, "images.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(files, f, ensure_ascii=False, indent=2)

print("OK ->", out_path, "(", len(files), "imgs )")
