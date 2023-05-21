rm -rf dist
rm -rf node_modules
cd ../cenv-lib
rm -rf dist
rm -rf node_modules
npm i
npm run build
cd ../cenv
npm i
npm run build
rm -rf node_modules/@stoked-cenv/cenv-lib
cp -R ../cenv-lib node_modules/@stoked-cenv
