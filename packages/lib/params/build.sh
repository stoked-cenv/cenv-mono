tsc
mkdir -p build
cp dist/index.js build
cp package.json build
cd build
npm i
rm -rf materializationLambda.zip
zip -r materializationLambda.zip  index.js package.json node_modules > zip.log
mv ./materializationLambda.zip ../
cd ..
