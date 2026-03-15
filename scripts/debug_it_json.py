import sys, json
p='messages/it.json'
s=open(p,'rb').read()
try:
    s.decode('utf-8')
except Exception as e:
    print('DECODE ERROR', e)
    sys.exit(1)
text=s.decode('utf-8')
print('file length', len(text))
# print sample around common close area
for pos in [3600, 3680, 3690, 3692, 3700, 3720, 4000]:
    start=max(0,pos-40)
    end=pos+40
    print('\n--- around pos', pos, '---')
    chunk=text[start:end]
    print(repr(chunk))
# try to json.loads and catch exception
try:
    json.loads(text)
    print('\nJSON PARSES OK')
except Exception as e:
    print('\nJSON ERROR:', repr(e))
    if hasattr(e, 'lineno') and hasattr(e, 'colno'):
        print('line, col', e.lineno, e.colno)
    # print lines around reported lineno
    try:
        lines=text.splitlines()
        for ln in range(85,105):
            print(ln+1, lines[ln])
    except Exception:
        pass
