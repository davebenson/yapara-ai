#! /bin/sh
#
#

if test x"$DELAY" != x; then
  sleep $DELAY
fi

echo "$OUTPUT"

if test "x$ERROR" != x ; then
  echo "$ERROR" 1>&2
fi

exit $EXIT_STATUS
