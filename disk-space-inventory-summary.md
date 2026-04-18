# Disk Space Inventory Summary

Generated: 2026-04-18
Scope: Windows-native read-only inventory for C: disk pressure and Goose build workspace.

## C: top-level usage observed
- C:\Users: 107.95 GB
- C:\Windows: 56.42 GB
- C:\Program Files: 38.74 GB
- C:\ProgramData: 20.74 GB
- C:\Program Files (x86): 13.80 GB
- C:\3uTools9: 9.28 GB
- C:\pagefile.sys: 3.77 GB
- C:\src: 1.17 GB
- C:\$Recycle.Bin: 0.82 GB

## C:\Users\mello top-level usage
- C:\Users\mello\AppData: 63.10 GB
- C:\Users\mello\.docker: 17.40 GB
- C:\Users\mello\OneDrive: 8.15 GB
- C:\Users\mello\.ollama: 4.07 GB
- C:\Users\mello\Desktop: 2.93 GB
- C:\Users\mello\.rustup: 2.30 GB
- C:\Users\mello\.antigravity: 1.43 GB
- C:\Users\mello\Downloads: 1.35 GB
- C:\Users\mello\.cache: 1.31 GB
- C:\Users\mello\.cargo: 1.05 GB

## Biggest AppData buckets
- C:\Users\mello\AppData\Local\wsl: 34.78 GB
- C:\Users\mello\AppData\Local\Docker: 9.80 GB
- C:\Users\mello\AppData\Local\Microsoft: 6.41 GB
- C:\Users\mello\AppData\Local\Google: 3.21 GB
- C:\Users\mello\AppData\Local\Packages: 1.73 GB
- C:\Users\mello\AppData\Local\Programs: 1.67 GB

## Largest individual files found under user profile
- C:\Users\mello\AppData\Local\wsl\{ea5db0e0-bbaf-4975-870b-daf7a6648f60}\ext4.vhdx: 34.782 GB
- C:\Users\mello\AppData\Local\Docker\wsl\data\ext4.vhdx: 9.679 GB
- C:\Users\mello\.docker\models\blobs\sha256\e8cd1a4c5162dfa355c567b4099206793793b5548951f077f376a0076dc0a058: 4.751 GB
- C:\Users\mello\.docker\models\bundles\sha256\1163f19dcd973b865c35d8e1a2c03736f4eb0a98c71e2b4425b7f84d183a423f\model\model.gguf: 4.751 GB
- C:\Users\mello\.docker\models\bundles\sha256\cc379c5c3638cf5e862821110b27e32d11bf92865275c2a90b203b0d509a0671\model\model.gguf: 4.751 GB
- C:\Users\mello\.ollama\models\mistral\mistral.gguf: 4.068 GB
- C:\Users\mello\AppData\Local\Microsoft\Edge\User Data\Default\ExtensionActivityEdge: 1.568 GB
- C:\Users\mello\.docker\models\blobs\sha256\4b3bf6e16b19d7f85fe4dd4ab2f8c8037ec14e656f8017fcfb42b30c3db26f67: 0.922 GB
- C:\Users\mello\.docker\models\bundles\sha256\1163f19dcd973b865c35d8e1a2c03736f4eb0a98c71e2b4425b7f84d183a423f\model\model.mmproj: 0.922 GB
- C:\Users\mello\.docker\models\bundles\sha256\cc379c5c3638cf5e862821110b27e32d11bf92865275c2a90b203b0d509a0671\model\model.mmproj: 0.922 GB
- C:\Users\mello\AppData\Local\Google\DriveFS\115982606689799038441\content_cache\d63\d47\19828: 0.876 GB
- C:\Users\mello\Downloads\Telegram Desktop\trae_projects.7z: 0.844 GB

## Goose workspace finding
- C:\src\goose is not the main disk consumer.
- Full Goose file inventory was exported to C:\src\goose\disk-inventory-goose-files.csv.
- Largest Goose-file report was exported to C:\src\goose\disk-inventory-goose-largest-files.txt.
- Build/log artifacts are MB-scale, not GB-scale.

## Generated report files
- C:\src\goose\disk-space-inventory-summary.md
- C:\src\goose\disk-inventory-goose-files.csv
- C:\src\goose\disk-inventory-goose-largest-files.txt
- C:\src\goose\disk-inventory-appdata-largest-folders.txt
- C:\src\goose\disk-inventory-vhdx-files.csv
- C:\src\goose\disk-inventory-user-files-over-500mb.csv
- C:\src\goose\disk-inventory-docker-home-folders.txt
- C:\src\goose\disk-inventory-user-large-common-files.txt

## Safe cleanup candidates to review manually
- WSL VHDX: reclaim by cleaning the WSL distro internally, then compacting the VHDX; do not delete the VHDX directly unless the distro is disposable.
- Docker WSL VHDX and Docker model cache: use Docker Desktop / docker prune / docker model cleanup workflows rather than deleting internals by hand.
- Ollama model: remove with ollama commands if no longer needed.
- Edge/Google cache files: clear via browser/app cache controls.
- Downloads/Desktop archives/logs: manually review before deletion.
