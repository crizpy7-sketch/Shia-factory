# broken-calc (fixture)

A tiny ES module project with statistics helpers and a failing test suite.

```
npm test        # node --test test/
```

`median` currently returns the upper middle value for an even number of samples instead of the
mean of the two middle values, so `median([1,2,3,4])` returns 3 rather than 2.5.

This defect is intentional. The end-to-end agent test copies this directory into a scratch
workspace and requires BORIS to find, repair and verify it. Fixing it here would remove the test's
subject.
