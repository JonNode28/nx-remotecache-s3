# nx-remotecache-s3

> This repo is forked from https://github.com/manfredsteyer/nx-remotecache-s3 and allows:
> * The full range of ini credential options and
> * The credentials s3 option to be omitted completely allowing the SDK to use temporary credentials available during a CodeBuild build

A task runner for [@nrwl/nx](https://nx.dev/react) that uses an Amazon S3 bucket as a remote cache, so all team members and CI servers can share a single cache. The concept and benefits of [computation caching](https://nx.dev/angular/guides/computation-caching) are explained in the NX documentation. This is a fork of [nx-remotecache-gcs](https://github.com/wvanderdeijl/nx-remotecache-gcs).

## Setup

```
npm install --save-dev nx-remotecache-s3
```

Create a S3 bucket. Since this is only a cache, there is no need for a dual- or multi-region bucket, so choose a  single location near you.

```
aws s3 mb s3://[BUCKET_NAME] --region [BUCKET_LOCATION]
```

setup a [lifecycle rule](https://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-mgmt.html) for your storage bucket to automatically delete old files. If you want to use our suggested auto-delete-after-30-days rule, you can simply use the json that is included:

```
aws s3api put-bucket-lifecycle-configuration --bucket [BUCKET_NAME] --lifecycle-configuration file://node_modules/nx-remotecache-gcs/lifecycle.json
```

You can also [restrict who can read and write](https://docs.aws.amazon.com/AmazonS3/latest/user-guide/set-permissions.html) to the bucket to only allow certain users or (build server) service accounts.

finally, add `tasksRunnerOptions` in your `nx.json` file

```json
{
    "projects": {
        ...
    },
    "tasksRunnerOptions": {
        "default": {
            "runner": "nx-remotecache-s3",
            "options": {
                "bucket": "NAME-OF-YOUR-STORAGE-BUCKET",
                "region": "BUCKET-REGION",
                "profile": "AWS-CLI-PROFILE-NAME",
                "cacheableOperations": [
                    "build",
                    "test",
                    "lint",
                    "e2e"
                ]
            }
        }
    }
}

```

run a build and see if files end up in your cache storage bucket:

```
nx run-many --target=build --all
```
