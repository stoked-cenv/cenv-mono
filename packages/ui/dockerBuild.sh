ecrUrl="${CDK_DEFAULT_ACCOUNT}".dkr.ecr."${AWS_REGION}".amazonaws.com
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ecrUrl}"
docker build -t "${1}" .
docker tag ec_cenv-lib:latest "${ecrUrl}"/"${1}":latest
docker push "${ecrUrl}"/"${1}":latest
