import defaultTaskRunner from '@nrwl/workspace/tasks-runners/default';
import { S3 } from '@aws-sdk/client-s3';
import { fromIni, fromEnv } from '@aws-sdk/credential-providers';
import { join, dirname, relative } from 'path';
import { promises, readFileSync } from 'fs';
import mkdirp from 'mkdirp';
import { default as getStream } from 'get-stream'
import { ProviderError } from "@aws-sdk/property-provider";
import {FromIniInit} from "@aws-sdk/credential-providers/dist-types/fromIni";
import {S3ClientConfig} from "@aws-sdk/client-s3/S3Client";

export default function runner(
    tasks: Parameters<typeof defaultTaskRunner>[0],
    options: Parameters<typeof defaultTaskRunner>[1] & {
        bucket?: string,
        profile?: string,
        region?: string,
        credentials?: {
            type: 'ENV' | 'INI',
            options?: FromIniInit
        }
    },
    context: Parameters<typeof defaultTaskRunner>[2],
) {
    if (!options.bucket) {
        throw new Error('missing bucket property in runner options. Please update nx.json');
    }

    const s3Config: S3ClientConfig = {
        region: options.region ?? 'us-east-1',
    }

    if(options.credentials){
        switch(options.credentials.type){
            case 'ENV':
                s3Config.credentials = fromEnv()
                break;
            case 'INI':
                s3Config.credentials = fromIni(options.credentials.options)
                break;
            default: throw new Error(`'${options.credentials.type}' is not an implemented credential provider. Please consider adding support and raising a PR.`)
        }
    }

    const s3 = new S3(s3Config)

    process.on('unhandledRejection', () => {});
    process.on('rejectionHandled', () => {});

    return defaultTaskRunner(tasks, { ...options, remoteCache: { retrieve, store } }, context);

    async function retrieve(hash: string, cacheDirectory: string): Promise<boolean> {
        try {
            const commitFile = `${hash}.commit`;
            try {
                await s3.headObject({
                    Bucket: options.bucket,
                    Key: `${hash}.commit`,
                });
            } catch (e: any) {
                if (e.name === 'NotFound') {
                    return false;
                } else if (e instanceof ProviderError) {
                    return false;
                } else {
                    throw e;
                }
            }

            const filesOutput = await s3.listObjects({
                Bucket: options.bucket,
                Prefix: `${hash}/`
            });

            const files = filesOutput.Contents?.map(f => f.Key) || [];

            await Promise.all(files.map(f => {
                if (f) {
                    return download(f);
                }

                return null;
            }));
            await download(commitFile); // commit file after we're sure all content is downloaded
            console.log(`retrieved ${files.length + 1} files from cache s3://${options.bucket}/${hash}`);
            return true;
        } catch (e: any) {
            console.log(e);
            console.log(`WARNING: failed to download cache from ${options.bucket}: ${e.message}`);
            return false;
        }

        async function download(fileKey: string) {
            const destination = join(cacheDirectory, fileKey);
            await mkdirp(dirname(destination));
            
            const fileOutput = await s3.getObject({
                Bucket: options.bucket,
                Key: fileKey
            });

            const fileStream = fileOutput.Body!;
            let contentBuffer: Buffer | null = await getStream.buffer(fileStream as any);
            
            if (fileOutput.Body) {
                return promises.writeFile(destination, contentBuffer);
            }
        }
    }

    async function store(hash: string, cacheDirectory: string): Promise<boolean> {
        const tasks: Promise<any>[] = [];
        try {
            await uploadDirectory(join(cacheDirectory, hash));
            await Promise.all(tasks);
            
            // commit file once we're sure all content is uploaded
            await s3.putObject({
                Bucket: options.bucket,
                Key: `${hash}.commit`,
                Body: readFileSync(join(cacheDirectory, `${hash}.commit`))
            });
            console.log(`stored ${tasks.length + 1} files in cache s3://${options.bucket}/${hash}`);
            return true;
        } catch (e: any) {
            console.log(`WARNING: failed to upload cache to ${options.bucket}: ${e.message}`);
            return false;
        }

        async function uploadDirectory(dir: string) {
            for (const entry of await promises.readdir(dir)) {
                const full = join(dir, entry);
                const stats = await promises.stat(full);
                if (stats.isDirectory()) {
                    await uploadDirectory(full);
                } else if (stats.isFile()) {
                    const destination = relative(cacheDirectory, full);
                    tasks.push(s3.putObject({
                        Bucket: options.bucket,
                        Key: destination,
                        Body: readFileSync(full)
                    }));
                }
            }
        }
    }
}
