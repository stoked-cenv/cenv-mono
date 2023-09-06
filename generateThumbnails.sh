#!/bin/bash

# test aws cli installation
#echo "Testing aws cli installation..."
#aws --version

#echo "Starting ffmpeg task..." && \
#echo "Copying video from s3://${S3_BUCKET}/${S3_KEY} to ${S3_KEY}..." && \
#aws s3 cp """s3://${S3_BUCKET}/${S3_KEY}""" """./${S3_KEY}""" && \

# get time duration of the video. it will be used to calculate the time offset
# echo "Getting video duration..." && \
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ./${INPUT_VIDEO}) && \
INCREMENT=$("$(DURATION)" / 10) && \

echo "DURATION: ${DURATION}" && \
echo "INCREMENT: ${INCREMENT}" && \

# run ffmpeg9
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_1.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_2.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_3.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_4.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_5.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_6.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_7.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_8.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_9.jpg"" && \
ffmpeg -v error -i """./${INPUT_VIDEO}""" -ss ${INCREMENT += INCREMENT} -vframes 1 -f image2 -an -y ""${INPUT_VIDEO}_10.jpg"" && \


#echo "Copying thumbnail to S3://${S3_BUCKET}./${OUTPUT_FILE} ..." && \
#aws s3 cp """./${OUTPUT_FILE}""" """s3://${S3_BUCKET}/${OUTPUT_FILE}"""

# cleanup
#rm -f """./${INPUT_VIDEO}"""
#rm -f """./${OUTPUT_FILE}"""
