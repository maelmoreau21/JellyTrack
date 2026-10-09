"""Install a synthetic Prisma adapter ONLY in an ignored historical QA archive."""
from pathlib import Path
import os,subprocess,shutil
root=Path(__file__).resolve().parents[2]
reference=Path(os.environ.get('REFERENCE_ROOT',str(root/'scratch/navigation-qa/main-reference'))).resolve()
scratch=(root/'scratch').resolve()
if scratch not in reference.parents:
 raise SystemExit('REFERENCE_ROOT must point inside this repository scratch directory; main is never edited.')
if not reference.is_dir() or not (reference/'src/lib/prisma.ts').is_file():
 raise SystemExit('Extract git archive main into an isolated reference directory first.')
relative=reference.relative_to(root).as_posix()
if subprocess.check_output(['git','check-ignore',relative],cwd=root,text=True).strip()!=relative:
 raise SystemExit('The reference directory must be ignored by Git.')
shutil.copyfile(root/'scripts/users-qa/reference-prisma.ts',reference/'src/lib/qa-users-prisma.ts')
shutil.copyfile(root/'scratch/users-qa/fixture.json',reference/'qa-users-fixture.json')
p=reference/'src/lib/prisma.ts';s=p.read_text(encoding='utf-8')
if "import { qaUsersPrisma }" not in s:
 s="import { qaUsersPrisma } from './qa-users-prisma';\n"+s
s=s.replace('globalThis.prismaGlobal ?? createPrismaStub()','qaUsersPrisma()')
p.write_text(s,encoding='utf-8')
print('Historical QA Prisma adapter installed; historical users components and styles preserved.')
