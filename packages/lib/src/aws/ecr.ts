import {
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  DeleteRepositoryCommand,
  BatchDeleteImageCommand,
  ListImagesCommand, Repository,

} from '@aws-sdk/client-ecr';
import { CenvLog, errorBold, infoBold } from '../log';

let _client: ECRClient = null;

function getClient() {
  if (_client) {
    return _client;
  }
  const { AWS_REGION, AWS_ENDPOINT } = process.env;

  _client = new ECRClient({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT
  });
  return _client;
}

export async function createRepository(repositoryName) {
  try {
    const cmd = new CreateRepositoryCommand({repositoryName});
    const res = await getClient().send(cmd);
    if (res && res.repository) {
      return res.repository;
    }
  } catch (e) {
    CenvLog.single.errorLog(`createRepository error: ${errorBold(e.message)}`);
  }
  return false;
}

export async function listImages(repositoryName) {
  try {
    const cmd = new ListImagesCommand({repositoryName});
    const res = await getClient().send(cmd);
    if (res && res.imageIds) {
      return res.imageIds;
    }
  } catch (e) {
    CenvLog.single.errorLog(`listImages error: ${errorBold(e.message)}`);
  }
  return false;
}

export async function deleteImages(repositoryName, imageIds = undefined) {
  try {

    if (!imageIds) {
      return true;
    }
    CenvLog.info(` - deleting ecr images ${infoBold(repositoryName)}`);
    const cmd = new BatchDeleteImageCommand({repositoryName, imageIds: imageIds });
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`deleteImages from ${repositoryName} error : ${errorBold(e.message)}`);
  }
  return false;
}

export async function deleteRepository(repositoryName, images: boolean = false) {
  try {
    const exists = await repositoryExists(repositoryName);
    if (!exists) {
      return true;
    }

    if (images) {
      const imageIds = await listImages(repositoryName);
      if (imageIds && imageIds?.length) {
        await deleteImages(repositoryName, imageIds);
      }
    }

    CenvLog.info(` - deleting ecr repo ${infoBold(repositoryName)}`);
    const cmd = new DeleteRepositoryCommand({repositoryName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`deleteRepository ${repositoryName} error: ${errorBold(e.message)}`);
  }
  return false;
}

export async function describeRepositories(): Promise<Repository[] | false> {
  try {
    const cmd = new DescribeRepositoriesCommand({});
    const res = await getClient().send(cmd);
    if (res && res.repositories) {
      return res.repositories;
    }
  } catch (e) {
    CenvLog.single.errorLog(`describeRepositories error: ${errorBold(e.message)}\n${JSON.stringify(e)}`);
  }
  return false;
}

export async function getRepository(repositoryName): Promise<Repository | false> {
  const repositories: any = await describeRepositories();
  if (!repositories)
    return false;

  for(let i = 0; i < repositories.length; i++) {
    const repo = repositories[i];
    if (repo.repositoryName === repositoryName) {
      return repo;
    }
  }
  return false;
}

export async function repositoryExists(repositoryName) {
  const repository = await getRepository(repositoryName);
  if (!repository)
    return false;

  return true;
}

export async function hasTag(repositoryName, tag, digest = undefined) {
  const images = await listImages(repositoryName);
  if (!images) {
    return false;
  }

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (image.imageTag === tag){
      if (digest === undefined) {
        return true;
      }
      return image.imageDigest === digest;
    }
  }
  return false;
}
