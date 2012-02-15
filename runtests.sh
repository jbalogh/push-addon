#!/bin/sh

TMP=$(mktemp -d -t push)
export TEST_DIR=$TMP

cp -r ./test/test-data/* $TMP

cfx test $*

rm -rf $TMP
