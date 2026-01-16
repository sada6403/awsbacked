@echo off
REM MongoDB Database Import Script for Windows

SET DATABASE=nf-farming
SET DATA_DIR=.\mongodb-data
SET MONGODB_URI=mongodb+srv://cst23071_db_user:vgquPlo0tLETMjvK@cluster0.s8fljgu.mongodb.net

echo Starting MongoDB import for %DATABASE% database...
echo Target URI: %MONGODB_URI%

mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection companies --file %DATA_DIR%\companies.json --jsonArray
mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection managers --file %DATA_DIR%\managers.json --jsonArray
mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection fieldvisitors --file %DATA_DIR%\fieldvisitors.json --jsonArray
mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection members --file %DATA_DIR%\members.json --jsonArray
mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection products --file %DATA_DIR%\products.json --jsonArray
mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection transactions --file %DATA_DIR%\transactions.json --jsonArray
mongoimport --uri "%MONGODB_URI%/%DATABASE%" --collection notifications --file %DATA_DIR%\notifications.json --jsonArray

echo Check above for any errors. If mongoimport is not found, please install MongoDB Tools.
