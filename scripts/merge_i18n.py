import json
import os
from collections import OrderedDict

def deep_merge(dict1, dict2):
    """Recursively merges dict2 into dict1."""
    for key, value in dict2.items():
        if key in dict1 and isinstance(dict1[key], dict) and isinstance(value, dict):
            deep_merge(dict1[key], value)
        else:
            dict1[key] = value
    return dict1

def get_all_keys(data, prefix=""):
    """Returns a set of all nested keys in dot notation."""
    keys = set()
    for k, v in data.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_all_keys(v, full_key))
        else:
            keys.add(full_key)
    return keys

def set_nested_key(data, key_path, value):
    """Sets a value in a nested dict using a dot-notated key path."""
    parts = key_path.split(".")
    for part in parts[:-1]:
        if part not in data or not isinstance(data[part], dict):
            data[part] = {}
        data = data[part]
    data[parts[-1]] = value

def sort_dict(d):
    """Recursively sorts a dictionary by keys."""
    if not isinstance(d, dict):
        return d
    return OrderedDict((k, sort_dict(v)) for k, v in sorted(d.items()))

def main():
    locales_dir = "messages"
    exclude = ["verification_full.json"]
    files = [f for f in os.listdir(locales_dir) if f.endswith(".json") and f not in exclude]
    
    print(f"Found {len(files)} locale files: {', '.join(files)}")
    
    all_data = {}
    master_schema = {}
    
    # 1. Load all data and build Master Schema
    for f in files:
        with open(os.path.join(locales_dir, f), "r", encoding="utf-8") as jf:
            try:
                data = json.load(jf)
                all_data[f] = data
                deep_merge(master_schema, data)
            except Exception as e:
                print(f"Error loading {f}: {e}")

    master_keys = get_all_keys(master_schema)
    print(f"Master Schema has {len(master_keys)} unique keys.")
    
    # 2. Priority for missing keys: fr.json -> en.json -> others
    priority = ["fr.json", "en.json"]
    priority = [p for p in priority if p in all_data]
    
    # 3. Align each file
    for f in files:
        current_data = all_data[f]
        current_keys = get_all_keys(current_data)
        missing = master_keys - current_keys
        
        if missing:
            print(f"File {f} is missing {len(missing)} keys. Filling...")
            for key in missing:
                # Find fallback value
                fallback_val = None
                for p in priority:
                    # Search in priority data
                    p_data = all_data[p]
                    # Get value for key
                    parts = key.split(".")
                    temp = p_data
                    found = True
                    for part in parts:
                        if isinstance(temp, dict) and part in temp:
                            temp = temp[part]
                        else:
                            found = False
                            break
                    if found and not isinstance(temp, dict):
                        fallback_val = temp
                        break
                
                if fallback_val is None:
                    print(f"  Warning: No fallback found for key '{key}' in {priority}")
                
                if fallback_val is not None:
                    set_nested_key(current_data, key, fallback_val)
        
        # 4. Save aligned and sorted file
        output_data = sort_dict(current_data)
        with open(os.path.join(locales_dir, f), "w", encoding="utf-8") as jf:
            json.dump(output_data, jf, ensure_ascii=False, indent=2)
            jf.write("\n")
        print(f"  Saved {f} (aligned).")

if __name__ == "__main__":
    main()
