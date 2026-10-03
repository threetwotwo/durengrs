import os
import zipfile

def make_zip():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    public_dir = os.path.join(project_root, 'public')
    os.makedirs(public_dir, exist_ok=True)
    
    zip_filename = 'cilowong-durian-farm.zip'
    dest_path = os.path.join(public_dir, zip_filename)
    root_dest_path = os.path.join(project_root, zip_filename)
    
    exclude_dirs = {
        'node_modules', '.git', '.aistudio', 'dist', '__pycache__', '.vite'
    }
    exclude_extensions = {'.zip', '.pyc'}
    
    print(f"Creating zip archive from {project_root}...")
    
    with zipfile.ZipFile(dest_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(project_root):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.git')]
            
            for file in files:
                ext = os.path.splitext(file)[1]
                if ext in exclude_extensions:
                    continue
                if file.startswith('.DS_Store'):
                    continue
                
                full_path = os.path.join(root, file)
                # Don't include the destination zip itself
                if os.path.abspath(full_path) == os.path.abspath(dest_path) or os.path.abspath(full_path) == os.path.abspath(root_dest_path):
                    continue
                
                rel_path = os.path.relpath(full_path, project_root)
                zipf.write(full_path, rel_path)
                
    # Also copy to root for direct access if needed
    import shutil
    shutil.copyfile(dest_path, root_dest_path)
    
    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    print(f"Successfully generated {zip_filename} ({size_mb:.2f} MB)")
    print(f"Location in public: {dest_path}")
    print(f"Location in root: {root_dest_path}")

if __name__ == '__main__':
    make_zip()
