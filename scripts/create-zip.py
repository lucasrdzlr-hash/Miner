import os
import zipfile

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
out_dir = os.path.join(root_dir, 'public', 'download')
os.makedirs(out_dir, exist_ok=True)
zip_path = os.path.join(out_dir, 'prisma-akme-latest.zip')

exclude_dirs = {'node_modules', '.git', 'dist', 'public'}

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for f in filenames:
            if f.endswith('.zip'):
                continue
            full_path = os.path.join(dirpath, f)
            rel_path = os.path.relpath(full_path, root_dir)
            zf.write(full_path, rel_path)
