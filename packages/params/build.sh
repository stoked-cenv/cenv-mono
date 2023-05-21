mkdir -p build
cp index.js build
cp package.json build
mkdir -p "build/node_modules/@stoked-cenv/cenv-lib/"
cp -R "../lib/" "build/node_modules/@stoked-cenv/cenv-lib/"
cd build
npm i
cd "node_modules/@stoked-cenv/cenv-lib/"
rm -rf node_modules
npm i
cd ../../..
rm -rf materializationLambda.zip
zip -r materializationLambda.zip  index.js package.json node_modules > zip.log
mv ./materializationLambda.zip ../
cd ..
