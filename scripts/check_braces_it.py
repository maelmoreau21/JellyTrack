p='messages/it.json'
with open(p,'rb') as f:
    s=f.read().decode('utf-8')
lines=s.splitlines()
for i,line in enumerate(lines[:200]):
    pass
# scan full text and track depth
depth=0
in_str=False
esc=False
positions=[]
for idx,ch in enumerate(s):
    if ch=='\\' and not esc:
        esc=True
        continue
    if ch=='"' and not esc:
        in_str=not in_str
    esc=False
    if in_str:
        continue
    if ch=='{':
        depth+=1
    elif ch=='}':
        depth-=1
    # record depth changes at line boundaries

    # get current line number
    # count lines up to idx
    # too slow to compute per char, but we can note when depth == 0
    if depth==0:
        # find line number
        line_no = s.count('\n',0,idx)+1
        positions.append((idx, line_no))

print('positions where depth==0 (idx, line):')
for pos in positions[:20]:
    print(pos)
print('last 5 lines around first position:')
if positions:
    idx, ln = positions[0]
    start = max(0, s.rfind('\n',0,idx)-100)
    end = min(len(s), idx+100)
    print('\n--- chunk ---\n', s[start:end])
else:
    print('none')
