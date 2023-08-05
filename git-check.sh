IFS=$'\n' dirs=( $(git status --short) )

if [[ $(git status --short) ]]; then
  echo "\033[0;31m ERROR: \033[4;91mcan't package cli while git status is not clear\033[0m"
  for d in "${dirs[@]}"; do
      echo "\t \033[0;31m $d \033[0m"
  done
  exit 1
fi