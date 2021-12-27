module.exports = async function (input) {
  // IMPORTING EXTRACTOR CONTEXT MODULE FOR EASY NAVIGATION IN WEB-PAGES

    let hasCaptcha = false;
    let lastResponseData;
    let pageId;

    var e = extractorContext;
    let debugFlag = false;
    let proxyToDebugCaptcha = { host: "", port: "", username: "", password: "" }; // REPLACE AS NEEDED
    let isPageLoading, isPageLoadedWithHotels;

    //429 - Too Many Requests , so trying to configure a wait before re-direct
    const waitIfHTTP429 = 10000;
    const waitAfterSolveCaptcha = 5000;
    const waitBetweenInteractions = 1000;

    const MAX_CAPTCHAS = 2;

    const cssVerifyCaptchaSolvedBtn = '/*VERIFY CAPTCHA SOLVE BUTTON CSS SELECTOR */';
    const cssPageLoader = '/* PAGE LOADER CSS SELECTOR */';
    

    //UTILITY FUNCTIONS
    function logError(e) {
        console.log(`..logError`);
        console.log("============== ERROR ===============");
        console.log(e);
        console.log("====================================");
    }

    async function getElementText(selector) {
        console.log(`..getElementText..`);
        var text = await e.execute(async function (selector) {
            console.log(document.querySelector(selector));
            var txt = document.querySelector(selector) && document.querySelector(selector).textContent.trim() || "";
            return txt;
        }, selector);
        return text;
    }

    async function checkIfElementExists(selector) {
        console.log('..checkIfElementExists..:', selector);
        var exists = await e.execute(async function (selector) {
            return document.querySelector(selector) !== null;
        }, selector);
        return exists;
    }

    async function waitForLoader(selector, limit) {
        console.log('..waitForLoader..:', selector);
        await e.execute(async function (selector, limit) {
            let timer = 0;
            while (timer < limit && document.querySelector(selector)) {
                console.log('waiting !!!! ');
                timer++;
                await new Promise(r => setTimeout(r, 500));
            }
        }, [selector, limit]);
    }

    //CUSTOM FUNCTIONS
    const isReCaptcha = async () => {
        console.log('..isReCaptcha..');
        return await e.execute(() => {
            return !!document.querySelector('.g-recaptcha');
        });
    }

    const solveCaptcha = async () => {
        console.log('..solveCaptcha..');
        await e.solveCaptcha({
            type: 'RECAPTCHA',
            inputElement: '.g-recaptcha'
        });
        await new Promise(r => setTimeout(r, waitAfterSolveCaptcha));
    }

    async function handleRedirectAfterCaptcha() {
        console.log("..handleRedirectAfterCaptcha..");

        await new Promise(r => setTimeout(r, waitIfHTTP429));
        await gotoWebPage();

        //CHECK IF CAPTCHA SOLVED - AFTER Verify BUTTON CLICK and REPORT BLOCKED
        verifyBtnExists = await checkIfElementExists(cssVerifyCaptchaSolvedBtn);
        if (verifyBtnExists) {
            var msg = `Could not solve CAPTCHA`;
            hasCaptcha = true;
            console.log(`${lastResponseData.code}: ${msg}`);
            e.reportBlocked(lastResponseData.code, msg);
            return false;
        }

        //CAPTCHA SOLVED - CHECK FOR PAGE LOAD 
        await waitForLoader(cssPageLoader, 20);
        isPageLoading = await checkIfElementExists(cssPageLoader);
        if (isPageLoading) {
            console.log('Captcha Solved - WITH redirect to Page Load');
        }
    }

    const solveCaptchaIfNecessary = async () => {
        console.log('..solveCaptchaIfNecessary..');

        if (await isReCaptcha()) {
            let retry = 0;
            while (await isReCaptcha() && retry < MAX_CAPTCHAS) {
                console.log(`======== TRY : ${retry + 1}=============`);
                retry++;
                await solveCaptcha();
                await clickVerifyButton();
            }

            //CHECK IF HOTEL LISTING IS POPULATED AFTER CAPTCHA, REDIRECT IF NOT SOLVED.
            isPageLoadedWithHotels = await checkIfElementExists(cssHotels);
            if (!isPageLoadedWithHotels) {
                await handleRedirectAfterCaptcha();
            }
        }
        return true;
    }

    async function clickVerifyButton() {
        //INTERACT - IF Verify BUTTON 
        let verifyBtnExists = await checkIfElementExists(cssVerifyCaptchaSolvedBtn);
        if (verifyBtnExists) {
            console.log("Verify Button Exists");
            pageId = await e.getPageId();
            console.log("clicking - Verify Button (I'm HUMAN) ");
            await e.click(cssVerifyCaptchaSolvedBtn);

            console.log('waitForNextPage after click !!!');
            await e.waitForNextPage(pageId);
            await new Promise(r => setTimeout(r, waitBetweenInteractions));
        }
    }

    async function gotoWebPage() {
        console.log(`..gotoWebPage..`);

        var options = {
            js_enabled: true,
            css_enabled: true,
            block_ads: false,
            //load_timeout: 60,
            load_all_resources: true,
            random_move_mouse: true,
            discard_CSP_header: true,
        };

        if (debugFlag) {
            options["proxy"] = proxyToDebugCaptcha;
        }

        lastResponseData = await e.goto({
            url: input._url,
            options: options
        });

        e.counter.increment('pageCount');
        console.log('end goto');
        console.log('lastResponseData...', lastResponseData);
        
        await new Promise(r => setTimeout(r, waitBetweenInteractions));
        isPageLoadedWithHotels = await checkIfElementExists(cssHotels);
        console.log('isPageLoadedWithHotels:', isPageLoadedWithHotels);

    }

    const run = async () => {
        console.log("..run..");
        await gotoWebPage();

        //Website blocks with the error - Access Denied 
        if (lastResponseData.code === 403) {
            console.log(`BLOCKED: ${lastResponseData.code}`);
            return e.reportBlocked(lastResponseData.code, 'Blocked: ' + lastResponseData.code);
        }

        if (lastResponseData.code === 404 || lastResponseData.code === 410) {
            return;
        }

        //429 - CAPTCHA
        if (lastResponseData.code === 429) {
            if (!await solveCaptchaIfNecessary()) {
                hasCaptcha = true;
                return;
            }
        }

        isPageLoadedWithHotels = await checkIfElementExists(cssHotels);
        if (isPageLoadedWithHotels) {
            return;
        }

        //Check for 404 after - 429 - CAPTCHA SOLVING
        if (lastResponseData.code === 404 || lastResponseData.code === 410) {
            return;
        }

        //SHOULD HANDLE IF CAPTCHA IS THROWN , without 429
        if (!await solveCaptchaIfNecessary()) {
            hasCaptcha = true;
            return;
        }

        //Check for 404 after CAPTCHA Check
        if (lastResponseData.code === 404 || lastResponseData.code === 410) {
            return;
        }
        return;
    };

    try {
        console.log(' ====== BEGIN NAV ======');
        e.counter.set('pageCount', 0);
        // await run();
        console.log(' ====== END NAV ======');
    }

    catch (e) {
        logError(e);
        if (typeof e === "string" && e.includes("Validation Error")) {
            throw e;
        }
        else {
            throw `NAVIGATION ERROR: ${e}`;
        }
    }


    const { iata, pickupDate, dropoffDate, carGroups, _url } = input;

    let pickupDateVal = Array.isArray(pickupDate) ? pickupDate[0] : pickupDate;
    let dropoffDateVal = Array.isArray(dropoffDate) ? dropoffDate[0] : dropoffDate;
    let iataVal = Array.isArray(iata) ? iata[0] : iata;
    console.log('IataVal:'+ iataVal);
    const countryId = input["Source Country"] ? typeof input["Source Country"] === "string" ? input["Source Country"] : input["Source Country"][0] : "";
    let carGroupsInputArray = carGroups && typeof carGroups == "string" ? carGroups.split("^") : carGroups[0].split("^");
    console.log('Cartypes number:', carGroupsInputArray);
    // Hardcoded Time fields
    const time = "1000AM";
    //Get website and URL
    const website = _url && typeof _url == "string" ? _url : _url.url;

    function calculate_length_of_rental(pickupDate, dropoffDate) {
        let pickupDateEpoch = new Date(pickupDate).getTime();
        let dropOffDateEpoch = new Date(dropoffDate).getTime();
        // calculate difference in epoch time
        let differenceEpoch = dropOffDateEpoch - pickupDateEpoch;
        // cet 1 day in milliseconds
        let one_day = 1000 * 60 * 60 * 24;
        // calculate number of days
        let num_of_days = differenceEpoch / one_day;
        return Math.round(num_of_days);
    }

    let lengthOfRental = calculate_length_of_rental(pickupDateVal, dropoffDateVal);

    //output Dates formatting
    let formattedPickupDate = extractorContext.moment(pickupDateVal).format("YYYY-MM-DD");
    let formattedDropoffDate = extractorContext.moment(dropoffDateVal).format("YYYY-MM-DD");

    // output Time Formating
    let formattedTime = extractorContext.moment(time, ["h:mm A"]).format("HH:mm");

    // Date destructuring
    let pickUpDate = new Date(pickupDateVal);
    const pickUpDay = pickUpDate.getDate();
    const pickUpMonth = pickUpDate.getMonth() + 1;
    const pickUpYear = pickUpDate.getFullYear();
    console.log('pickUp: '+pickUpDay+'.'+pickUpMonth+'.'+pickUpYear);
    let dropOffDate = new Date(dropoffDateVal);
    const dropOffDay = dropOffDate.getDate();
    const dropOffMonth = dropOffDate.getMonth() + 1;
    const dropOffYear = dropOffDate.getFullYear();
    console.log('dropDay: '+dropOffDay+'.'+dropOffMonth+'.'+dropOffYear);
    var PickUp_date = pickUpDay+'.'+pickUpMonth+'.'+pickUpYear;
    var Drop_date = dropOffDay+'.'+dropOffMonth+'.'+dropOffYear;


     let IATAlist = await extractorContext.fetch(`/*URL.Json*/`,{
        headers: {
            accept: "application/json",
        },
        method: "GET",
        mode: "no-cors",
    })
    .then(r => r.json())

    console.log(IATAlist);

    // try {
    //     await extractorContext.solveCaptcha({
    //         type: 'FUNCAPTCHA',
    //         inputElement: 'div#CAPTCHA'
    //         });
    // } catch (error) {
    //         console.log('Captcha Error', error);
    // }
    // console.log('Till HEREEE 317');
    //____________________
    // const isReCaptcha = async () => {
    //     console.log('..IsCaptcha..');
    //     return await e.execute(() => {
    //         return !!document.querySelector('#CAPTCHA');
    //     });
    // }
  
    // const solveCaptcha = async () => {
    //     console.log('..solveCaptcha..');
    //     await e.solveCaptcha({
    //       type: 'FUNCAPTCHA',
    //       inputElement: 'body',
    //       autoSubmit: true
    //     });
    //     await new Promise(r => setTimeout(r, 1000));        
    // }
    //____________________
    var locationList = IATAlist.sr   
    var dpln = ''
    for (let index = 0; index < locationList.length; index++) {
        if (locationList[index].hierarchyInfo.airport.airportCode ==iataVal && locationList[index].type == 'AIRPORT' ) {
            dpln = locationList[index].gaiaId                
        }          
    }


    let listingUIUrl = "/* INPUT URL */" + iataVal + "&loc2=" + iataVal + "&date1=" + pickUpDay + "%2F" + pickUpMonth + "%2F" + pickUpYear + "&time1=" + time + "&date2=" + dropOffDay + "%2F" + dropOffMonth + "%2F" + dropOffYear + "&time2=" + time + "&subm=1";
    
   

    
    await extractorContext.goto(listingUIUrl);
    await new Promise(r=> setTimeout(r, 30000));
    console.log("listingUIUrl", listingUIUrl);
  
    // handling No records found error
    const ifError = await extractorContext.execute(async () => {
        if (document.querySelector("ERROR POPUP CSS SELECTOR")) {
            return true;
        }else{
            return false
        }
    });
    console.log('IsError: '+ ifError);
    
    if (ifError) {
        // TODO: escape hatch
        console.log("No results found");
        //throw new Error('No results found');
        let carObj = {};
        return carObj;
    }

    await extractorContext.execute(() => {
        const { carGroups } = input;
        let carGroupsVal = Array.isArray(carGroups) ? carGroups[0] : carGroups;
        carGroupArr = carGroupsVal.split("^");
        var divs = document.querySelectorAll("CAR INFO BOX CSS SELECTOR");
        console.log('divs', divs);
        divs.forEach.call(divs, async function (carTypeList) {
            const carType = carTypeList.innerText.split(" ")[0].trim();
            for (let i = 0; i < carGroupArr.length; i++) {
                if ("" + carGroupArr[i].toLowerCase() === "" + carType.toLowerCase()) {
                    let t = carTypeList.parentElement.childNodes;
                    t[2].click();
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        });
    }, [input]);
    
    // Click on load more button
    
    //SHOW MORE BUTTON++>
    await extractorContext.execute(async () => {
        while (document.querySelector("SHOW MORE BUTTON CSS SELECTOR")) {
            document.querySelector("SHOW MORE BUTTON CSS SELECTOR").click();
            await new Promise(r => setTimeout(r, 10000));
        }
    });

    // Finding pickup and dropoff location
    const loc = await extractorContext.execute(function () {
        let locationArr = [];
        let location = document.querySelectorAll("/*LOCATION TEXT CSS SELECTOR */")
        Array.from(location).forEach(element => {locationArr.push(element.innerText)})? document.querySelectorAll("/*LOCATION TEXT CSS SELECTOR */").innerText
            : "GVA";
            console.log(document.querySelectorAll("/*LOCATION TEXT CSS SELECTOR */"));
            console.log('Location: '+ location);
        return locationArr;
    });
    
    const loc = iataVal
    console.log('421');
    // Collect all the urls from listings page
    const reserveUrlList = await extractorContext.execute(
        function (loc, formattedPickupDate, formattedTime, formattedDropoffDate, iataVal, carGroupsInputArray, website, lengthOfRental, countryId) {
            
            function synthesizeAcriss(groupArg = null, doorsArg = null, transmissionArg = null, airconArg = null) {
                var group, doors, transmission, aircon;
                if(groupArg){
                    group = groupArg.toString().replace(/\w/g, letter => letter.toUpperCase());
                }
                else{
                    group = "?";
                }

                if(doorsArg){
                    doors = doorsArg.toString();
                }else{
                    doors = "?";
                }

                if(transmissionArg) 
                {
                    transmission = transmissionArg.toString();
                }else{
                    transmission = "?";
                }

                if(airconArg){
                    aircon = airconArg.toString();
                }else{
                    aircon = "?";
                };
            

            const firstLetterMap = {
                    MINI: 'M',
                    ECONOMY: 'E',
                    COMPACT: 'C',
                    INTERMEDIATE: 'I',
                    STANDARD: 'S',
                    'FULL-SIZE': 'F',
                    PREMIUM: 'P',
                    LUXURY: 'L',
                    SPECIAL: 'X',
                };

            let firstLetter = '?';
            if (group in firstLetterMap) {
                firstLetter = firstLetterMap[group];
            }

            let secondLetter = '?';
            if (group === 'SUV') {
                secondLetter = 'F';
            } else if (group === 'SPORT') {
                secondLetter = 'S';
            } else if (group === 'LIMOUSINE') {
                secondLetter = 'L';
            } else if (group === 'WAGON/ESTATE') {
                secondLetter = 'W';
            } else if (group === 'CROSSOVER') {
                secondLetter = 'G';
            } else if (group === 'PASSENGER VAN') {
                secondLetter = 'V';
            } else if (doors === '2' || doors === '3') {
                secondLetter = 'B';
            } else if (doors === '4' || doors === '5') {
                secondLetter = 'D';
            }

            let thirdLetter = '?';
            if (transmission === 'Manual') {
                thirdLetter = 'M';
            } else if (transmission === 'Automatic') {
                thirdLetter = 'A';
            }

            let fourthLetter = '?';
            if (aircon === 'true') {
                fourthLetter = 'R';
            } else if (aircon === 'false') {
                fourthLetter = 'N';
            }

            return firstLetter + secondLetter + thirdLetter + fourthLetter;
        }
            let carURLs = [];
            let carGroupSpans = document.querySelectorAll("div.offer-card-desktop");
            console.log('CarGroupsLength: '+ carGroupSpans.length);
            var carnumber = 0;
            carGroupSpans.length > 0 && carGroupSpans.forEach(item => {
                console.log('carnumber'+ carnumber);
        
                try {
                    
                let vehicleType = item.querySelector("/*VEHICLE TYPE INPUT CSS SELECTOR */")? item.querySelector("/*VEHICLE TYPE INPUT CSS SELECTOR */").innerText: "";
                vehicleType = vehicleType.includes("/*TYPE NAME 1 */") ? vehicleType.replace("/* PREVIOUS NAME */", "/* NEW NAME*/") : vehicleType;
                vehicleType = vehicleType.includes("/*TYPE NAME 2 */") ? vehicleType.replace("/* PREVIOUS NAME */", "/* NEW NAME*/") : vehicleType;
                vehicleType = vehicleType.includes("/*TYPE NAME 3 */") ? vehicleType.replace("/* PREVIOUS NAME */", "/* NEW NAME*/") : vehicleType;
                vehicleType = vehicleType.includes("/*TYPE NAME 4 */") ? vehicleType.replace("/* PREVIOUS NAME */", "/* NEW NAME*/") : vehicleType;
                vehicleType = vehicleType.includes("/*TYPE NAME 5 */") ? vehicleType.replace("/* PREVIOUS NAME */", "/* NEW NAME*/") : vehicleType;
                vehicleType = vehicleType.includes("/*TYPE NAME 6 */") ? vehicleType.replace("/* PREVIOUS NAME */", "/* NEW NAME*/") : vehicleType;
                console.log('vehicletype:',vehicleType);carGroupSpans.length
                
                for (let i = 1; i < carGroupsInputArray.length; i++) {
                    console.log('carGroupInputArray',carGroupsInputArray.length);
                    console.log('vehicletype',vehicleType );
                    console.log('CarGroupInputARray',carGroupsInputArray );
                    
                    if (vehicleType.toLowerCase().includes(carGroupsInputArray[i].toLowerCase())) {
                        console.log('CarGroup',carGroupsInputArray[i] );
                        let reserveButton = item.querySelector("/* EXTRA INFO CSS SELECTOR*/").href;
                        let carDetailObj = {};
                        console.log('440');
                        
                        carDetailObj.dateOfSearch = new Date().toISOString().slice(0, 10);
                        carDetailObj.iata = iataVal;
                        carDetailObj.url = reserveButton + "&langid=2057";
                        carDetailObj.website = website.slice(0, website.lastIndexOf('/'));
                        let airportPickup = item.querySelector('PICKUP lOCATION CSS SELECTOR') ? item.querySelector('PICKUP lOCATION CSS SELECTOR').innerText.replace("Pick-up:", "") : "";
                        airportPickup = airportPickup && airportPickup.trim();
                        carDetailObj.pickupLocation = airportPickup !== "" ? loc + " - " + airportPickup : loc;
                        carDetailObj.pickupDate = formattedPickupDate;
                        
                        carDetailObj.pickupTime = formattedTime;
                        carDetailObj.dropOffLocation = loc;
                        carDetailObj.dropOffDate = formattedDropoffDate;
                        
                        carDetailObj.dropOffTime = formattedTime;
                        
                        carDetailObj.lengthOfRental = lengthOfRental;
                        carDetailObj.supplier = item.querySelector("SUPPLIER NAME CSS SELECTOR") ? item.querySelector("SUPPLIER NAME CSS SELECTOR").attributes.alt.value.split("")[0].trim() : "";
                        if (carDetailObj.supplier.includes('&amp;')) {
                            carDetailObj.supplier = carDetailObj.supplier.replace(/&.*?;/, "&");
                        }
                        carDetailObj.carGroup = vehicleType;
                        carDetailObj.carModel = item.querySelector("CAR MODEL CSS SELECTOR") ? item.querySelector("CAR MODEL CSS SELECTOR").innerText.split("")[0].trim() : "";
                        console.log('CarModel:',carDetailObj.carModel,);
                        carDetailObj.passengers = item.querySelector("CAR PASSENGER CSS SELECTOR") ? parseInt(item.querySelector("CAR PASSENGER CSS SELECTOR").innerText.trim()) : "";
                        
                        // Not available on site
                        carDetailObj.suitcases = "";
                        carDetailObj.bags = "";
                        carDetailObj.acriss = "";

                        //listing
                        let doorsVal = item.querySelector("CAR DOORS CSS SELECTOR") ? item.querySelector("CAR DOORS CSS SELECTOR").innerText : "";
                        let doors = doorsVal.includes("/") ? doorsVal.split("/")[1] : doorsVal;
                        carDetailObj.doors = doors !== "" ? parseInt(doors) : "";
                        carDetailObj.transmission = item.querySelector("CAR TRANSMISSION CSS SELECTOR") ? item.querySelector("CAR TRANSMISSION CSS SELECTOR").innerText : "";
                        carDetailObj.mileageLimit = item.querySelector("CAR MILEAGE CSS SELECTOR") ? item.querySelector("CAR MILEAGE CSS SELECTOR").innerText.split("\n")[0].trim() : "";
                        console.log('474');
                        //acriss
                        let acrissClassType = synthesizeAcriss(carDetailObj.carGroup, carDetailObj.doors, carDetailObj.transmission, carDetailObj.aircon);
                        if(acrissClassType){
                            carDetailObj.acriss= acrissClassType;
                            console.log("Acriss : ",carDetailObj.acriss);  
                        }
                        else{
                            carDetailObj.acriss="";
                        }
                        
                
                        console.log('482');
                        let currency = item.querySelector("CURRENCY CSS SELECTOR")
                            ? item.querySelector("CURRENCY CSS SELECTOR").innerText
                            : "";
                        carDetailObj.currency = currency.includes("COUNTRY ABBREVATION") ? "COUNTRY ABBREVATION" : "";
                        carDetailObj.sourceMarket = countryId;
                        
                        
                        // Standard Features
                        let standardFeaturesArr = [];
                        standardFeaturesArr.push(`${carDetailObj.transmission}`);
                        standardFeaturesArr.push(`doors: ${carDetailObj.doors}`);
                        standardFeaturesArr.push(`passengers: ${carDetailObj.passengers}`);
                        standardFeaturesArr.push(`mileage: ${carDetailObj.mileageLimit}`);
                        standardFeaturesArr.push(`fuel policy: ${carDetailObj.fuelPolicy}`);
                        standardFeaturesArr.push(`air condition: ${carDetailObj.aircon}`);
                        carDetailObj.standardFeatures = standardFeaturesArr;
                        console.log('502');
                        // All Price
                        const description = document.querySelector("DESCRIPTION CSS SELECTOR") ? document.querySelector("DESCRIPTION CSS SELECTOR").innerText : "";
                        carDetailObj.priceDescriptionArr = description.includes("*") ? "PRICE DESCRIPTION CSS SELECTOR" : "";
                       
                        carDetailObj.pricePayLocalArr = [];
                        carDetailObj.pricePayLocalBasisArr = [];
                        carDetailObj.pricePayLocalCurrencyArr = [];
                        carDetailObj.pricePayNowArr = [];
                        carDetailObj.pricePayNowBasisArr = [];
                        carDetailObj.pricePayNowCurrencyArr = [];
                        console.log('513');
                        let priceTotal = item.querySelector("PRICE CSS SELECTOR") ? item.querySelector("PRICE CSS SELECTOR").innerText : "";
                        const priceRegex = /[+-]?\d+(\.\d+)?/g;
                        priceTotal = priceTotal.replace("‘", "");
                        priceTotal = priceTotal.match(priceRegex);
                        carDetailObj.pricePayNowArr.push(priceTotal[0]);
                        if (carDetailObj.pricePayNowArr !== "") {
                            carDetailObj.pricePayNowCurrencyArr.push(carDetailObj.currency);
                            carDetailObj.pricePayNowBasisArr.push(parseFloat(carDetailObj.pricePayNowArr / carDetailObj.lengthOfRental).toFixed(2));
                        }
                        console.log('PricePayNoww arr',carDetailObj.pricePayNowArr);
                        
                        //Extracting from details page
                        carDetailObj.extrasNameArr = [];
                        carDetailObj.extrasDescriptionArr = [];
                        carDetailObj.extrasPriceArr = [];
                        carDetailObj.extrasCurrencyArr = [];
                        carDetailObj.insuranceTerms = "";
                        carDetailObj.insurancePackageLevelArr = [];
                        carDetailObj.insurancePriceArr = [];
                        carDetailObj.insuranceCurrencyArr = [];
                        carDetailObj.insuranceDescriptionArr = [];
                        console.log('carDetailsObj', carDetailObj);
                        carURLs.push(carDetailObj);
                        console.log('objext pushed');
                    }
                }
                } catch (error) {
                    console.log("!!!!!!Error!!!!!!",error);
                }
                carnumber+=1
            
            });
            console.log('carUrls:', carURLs);
            return carURLs;
        },
        [loc, formattedPickupDate, formattedTime, formattedDropoffDate, iataVal, carGroupsInputArray, website, lengthOfRental, countryId]
    );

    reserveUrlList.forEach(function (car) {
        let identity = extractorContext.uuid();
        car.id = identity;
    });
    console.log('reserve Url list',reserveUrlList.length);
    
    const reserveUrlsData = extractorContext.createData(reserveUrlList);
    return extractorContext.return(reserveUrlsData);

   
};
