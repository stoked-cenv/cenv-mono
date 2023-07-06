tsc
mkdir -p build
cp dist/index.js build
cp params-build.json build/package.json
cd build
yarn install
rm -rf materializationLambda.zip
zip -r materializationLambda.zip  index.js package.json node_modules #> zip.log
mv ./materializationLambda.zip ../
cd ..
cd