#!/bin/bash
# Keeps git history original: pins author/committer identity and rejects
# third-party attribution trailers in commit messages.
OWNER_NAME="mohanadkandil"
OWNER_EMAIL="mohanadmkandil@gmail.com"
# Match attribution TRAILERS (line-initial), not prose that merely
# contains words like "cursor".
BANNED='^(co[- ]authored[- ]by|generated[- ]with|generated[- ]by|assisted[- ]by|ai[- ]generated|pair[- ]programmed[- ]with|[a-z0-9]*([Cc]laude|[Aa]nthropic|[Cc]opilot|[Oo]pen[Aa][Ii]|[Cc]ursor|[Ff]actory[- ][Dd]roid|[Dd]evin|[Cc]odeium))\b[ :]'

MODE="${1:-identity}"
if [ "$MODE" = "message" ]; then
  MSGFILE="$2"
  [ -f "$MSGFILE" ] || { echo "COMMIT REJECTED: message file '$MSGFILE' missing." >&2; exit 1; }
  if grep -iqE "$BANNED" "$MSGFILE"; then
    echo "COMMIT REJECTED: third-party attribution trailer found in commit message." >&2
    grep -inE "$BANNED" "$MSGFILE" >&2
    exit 1
  fi
fi

AE="$(git var GIT_AUTHOR_IDENT 2>/dev/null | sed 's/^.*<//;s/>.*//')"
CE="$(git var GIT_COMMITTER_IDENT 2>/dev/null | sed 's/^.*<//;s/>.*//')"
if [ "$AE" != "$OWNER_EMAIL" ] || [ "$CE" != "$OWNER_EMAIL" ]; then
  echo "COMMIT REJECTED: author/committer email must be $OWNER_EMAIL (got '$AE' / '$CE')." >&2
  exit 1
fi
exit 0
