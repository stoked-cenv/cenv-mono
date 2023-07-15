npx rimraf dist build materializationLambda materializationLambda.zip pnpm-lock.yaml node_modules package-lock.json
mkdir -p build/params
mkdir -p build/lib
cp ../package.json build/lib/
dist ../package.json build/lib/
cp ./package.json.disable build/package.json
cp ./tsconfig.json build/tsconfig.json
cp -r ./src build/src
cd build
npm i
tsc
rm -rf materializationLambda.zip
zip -r materializationLambda.zip  index.js package.json node_modules > zip.log
mv ./materializationLambda.zip ../
cd ..
rm -rf build

