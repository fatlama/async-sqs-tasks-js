# async-sqs-tasks-js

What does this library do?

## Getting Started

* To just run tests: `yarn test`
* To format the code using prettier: `yarn format`
* To run the entire build process: `yarn release`

## Publishing to NPM

Use the built-in `npm version {patch|minor}` tool to increment the version number and trigger a release

```
$ git checkout -b release-1.0.1
$ npm version patch -m "Your release message here"
$ git push --tag
```

Once approved you should be able to merge into master. This will trigger a test-build-release flow in Circle CI. You
will need to press the `confirm_publish` step and approve the publish.

NOTE: CircleCI will only listen for tags matching vX.Y.Z with any optional suffixes
