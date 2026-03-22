import json
import os
from collections import OrderedDict

def sort_dict(d):
    if not isinstance(d, dict): return d
    return OrderedDict((k, sort_dict(v)) for k, v in sorted(d.items()))

def get_all_keys(data, prefix=""):
    keys = set()
    for k, v in data.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict): keys.update(get_all_keys(v, full_key))
        else: keys.add(full_key)
    return keys

def set_nested_key(data, key_path, value):
    parts = key_path.split(".")
    for part in parts[:-1]:
        if part not in data or not isinstance(data[part], dict): data[part] = {}
        data = data[part]
    data[parts[-1]] = value

def load_json(path):
    with open(path, "r", encoding="utf-8") as f: return json.load(f)

def main():
    fr = load_json("messages/fr.json")
    en = load_json("messages/en.json")
    de = load_json("messages/de.json")
    
    fr_keys = get_all_keys(fr)
    de_keys = get_all_keys(de)
    
    missing = fr_keys - de_keys
    if missing:
        print(f"DE is missing {len(missing)} keys. Using EN as fallback.")
        for k in missing:
            parts = k.split(".")
            temp = en
            val = None
            for p in parts:
                if isinstance(temp, dict) and p in temp: temp = temp[p]
                else: break
            else:
                if not isinstance(temp, dict): val = temp
            
            if val is None: # Fallback to FR
                temp = fr
                for p in parts:
                    if isinstance(temp, dict) and p in temp: temp = temp[p]
                    else: break
                else:
                    if not isinstance(temp, dict): val = temp
            
            if val is not None:
                set_nested_key(de, k, val)
    
    with open("messages/de.json", "w", encoding="utf-8") as f:
        json.dump(sort_dict(de), f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("DE repaired.")

if __name__ == "__main__":
    main()
