#!/bin/bash
# Load SDKMAN if available to ensure mvn is found
[[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"

# Compile and run the application, explicitly specifying the main class from Application.kt
PORT=8080
echo "Checking port $PORT..."
PID=$(lsof -ti:$PORT)

if [ -n "$PID" ]; then
    echo "Port $PORT is busy (PID: $PID). Killing process..."
    kill -9 $PID
    sleep 2
    echo "Process killed."
else
    echo "Port $PORT is free."
fi

# Compile and run the application, explicitly specifying the main class from Application.kt
mvn clean compile exec:java -Dexec.mainClass="com.githelp.ApplicationKt"
