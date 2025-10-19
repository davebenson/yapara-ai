#! /bin/sh
#
#

: ${REPEAT:=1}

for index in `seq $REPEAT`; do
  if test x"$DELAY" != x; then
    sleep $DELAY
  fi

  echo "$OUTPUT"

  if test "x$ERROR" != x ; then
    echo "$ERROR" 1>&2
  fi
done

exit $EXIT_STATUS
