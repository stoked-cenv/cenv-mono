import {
  BatchDeleteImageCommand,
  CreateRepositoryCommand,
  DeleteRepositoryCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  ListImagesCommand,
  Repository,
} from '@aws-sdk/client-ecr';
import {CenvLog, colors} from '../log.service';

let _client: ECRClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new ECRClient({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
                          });
  return _client;
}

export async function createRepository(repositoryName: string) {
  try {
    const cmd = new CreateRepositoryCommand({repositoryName});
    const res = await getClient().send(cmd);
    if (res && res.repository) {
      return res.repository;
    }
  } catch (e) {
    CenvLog.single.errorLog(`createRepository error: ${colors.errorBold(e as string)}`);
  }
  return false;
}

export async function listImages(repositoryName: string) {
  try {
    const cmd = new ListImagesCommand({repositoryName});
    const res = await getClient().send(cmd);
    if (res && res.imageIds) {
      return res.imageIds;
    }
  } catch (e) {
    CenvLog.single.errorLog(`listImages error: ${colors.errorBold(e as string)}`);
  }
  return false;
}

export async function deleteImages(repositoryName: string, imageIds: any = undefined) {
  try {

    if (!imageIds) {
      return true;
    }
    CenvLog.info(` - deleting ecr images ${colors.infoBold(repositoryName)}`);
    const cmd = new BatchDeleteImageCommand({repositoryName, imageIds: imageIds});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`deleteImages from ${repositoryName} error : ${colors.errorBold(e as string)}`);
  }
  return false;
}

export async function deleteRepository(repositoryName: string, images = false) {
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

    CenvLog.info(` - deleting ecr repo ${colors.infoBold(repositoryName)}`);
    const cmd = new DeleteRepositoryCommand({repositoryName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`deleteRepository ${repositoryName} error: ${colors.errorBold(e as string)}`);
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
    CenvLog.single.errorLog(`describeRepositories error: ${colors.errorBold(e as string)}\n${JSON.stringify(e)}`);
  }
  return false;
}

export async function getRepository(repositoryName: string): Promise<Repository | false> {
  const repositories: any = await describeRepositories();
  if (!repositories) {
    return false;
  }

  for (let i = 0; i < repositories.length; i++) {
    const repo = repositories[i];
    if (repo.repositoryName === repositoryName) {
      return repo;
    }
  }
  return false;
}

export async function repositoryExists(repositoryName: string) {
  const repository = await getRepository(repositoryName);
  if (!repository) {
    return false;
  }

  return true;
}

export async function hasTag(repositoryName: string, tag: string, digest: any = undefined) {
  const images = await listImages(repositoryName);
  if (!images) {
    return false;
  }

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (image.imageTag === tag) {
      if (digest === undefined) {
        return true;
      }
      return image.imageDigest === digest;
    }
  }
  return false;
}

export async function getTag(repositoryName: string, tag: string) {
  const images = await listImages(repositoryName);
  if (!images) {
    return false;
  }

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (image.imageTag === tag) {
      return image;
    }
  }
  return false;
}

export async function getDigest(repositoryName: string, digest: string) {
  const images = await listImages(repositoryName);
  if (!images) {
    return false;
  }

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (image.imageDigest === digest) {
      return image;
    }
  }
  return false;
}