#!/bin/sh

# required env vars
# ARECORD="dev.domain.com."
# DOMAIN="domain.com."

HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name | jq --arg name "${DOMAIN}" -r '.HostedZones | .[] | select(.Name=="\($name)") | .Id | split("/")[2]')

JSON_FILE=`mktemp`

(
cat <<EOF
{
    "Comment": "Delete single record set",
    "Changes": [
        {
            "Action": "DELETE",
            "ResourceRecordSet": {
                "Name": "${DOMAIN}",
                "Type": "A",
                "ResourceRecords": [
                    {
                        "Value": "${ARECORD}"
                    }
                ]
            }
        }
    ]
}
EOF
) > $JSON_FILE

echo "Deleting DNS Record set"
aws route53 change-resource-record-sets --hosted-zone-id ${HOSTED_ZONE_ID} --change-batch file://$JSON_FILE

echo "Deleting record set ..."
echo
echo "Operation Completed."
