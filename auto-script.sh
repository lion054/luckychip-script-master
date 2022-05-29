# !/bin/sh
currentLog='log.txt'
while true
do
    procnum=`ps -ef | grep "node auto-script" | grep -v grep | wc -l` 
    time=$(date +'%Y%m%d_%H%M%S')
    if [ $procnum -eq 1 ]; then
        echo "$time proc exist'"
        errornum=`grep "WsClose" $currentLog | wc -l`
        if [ $errornum -ne 0 ]; then
            for pid in `ps aux | grep "node auto-script" | grep -v grep | awk '{print $2}'`
            do
                echo $pid
                kill -9 $pid
            done
            currentLog='log_'$time'.txt'
            nohup node auto-script.js >$currentLog 2>&1 &
        fi
    elif [ $procnum -eq 0 ]; then
        currentLog='log_'$time'.txt'
        nohup node auto-script.js >$currentLog 2>&1 &
    else
        echo "Error $procnum kill all and restart"
        for pid in `ps aux | grep "node auto-script" | grep -v grep | awk '{print $2}'`
        do
            echo $pid
            #kill -2 $pid
            kill -9 $pid
        done
        currentLog='log_'$time'.txt'
        nohup node auto-script.js >$currentLog 2>&1 &
    fi
    sleep 30
done
