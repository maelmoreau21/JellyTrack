#!/bin/sh

urlencode() {
  local string="$1" i c
  local encoded=""
  for i in $(seq 0 $((${#string} - 1))); do
    c=$(printf '%s' "$string" | cut -c$((i+1)))
    case "$c" in
      [a-zA-Z0-9._~-]) encoded="${encoded}${c}" ;;
      *) encoded="${encoded}$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$encoded"
}

test_pwd() {
  local pwd="$1"
  local enc=$(urlencode "$pwd")
  echo "Original: $pwd"
  echo "Encoded:  $enc"
}

test_pwd "p@ss&word#1"
test_pwd "abc"
test_pwd "a b c"
test_pwd "pw'"
test_pwd 'pw"'
