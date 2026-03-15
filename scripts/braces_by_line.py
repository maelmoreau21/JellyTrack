p='messages/it.json'
s=open(p,'rb').read().decode('utf-8')
lines=s.splitlines()

def depth_of_text(text, start_depth=0):
    depth=start_depth
    in_str=False
    esc=False
    for ch in text:
        if ch=='\\' and not esc:
            esc=True
            continue
        if ch=='"' and not esc:
            in_str = not in_str
        esc=False
        if in_str:
            continue
        if ch=='{':
            depth+=1
        elif ch=='}':
            depth-=1
    return depth

depth=0
for i,line in enumerate(lines):
    prev = depth
    depth = depth_of_text(line, depth)
    if i<140:
        print(f"{i+1:4}: depth {depth} | {line}")
    else:
        if depth==0 or (i>80 and i<130):
            print(f"{i+1:4}: depth {depth} | {line}")

print('\nFinal depth', depth)
