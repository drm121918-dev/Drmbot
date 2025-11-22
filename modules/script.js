const readline = require('readline');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

// Extract Authorization Bearer token from lw_tokens cookie (JSON-encoded)
function extractBearerFromCookies(cookies) {
    try {
        if (!cookies) return null;
        const match = cookies.match(/lw_tokens=([^;]+)/);
        if (!match) return null;
        const decoded = decodeURIComponent(match[1]);
        const obj = JSON.parse(decoded);
        if (obj && obj.access_token && (obj.token_type || 'Bearer')) {
            const type = obj.token_type || 'Bearer';
            return `${type} ${obj.access_token}`;
        }
    } catch (_) {}
    return null;
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to make POST request
function makePostRequest(url, cookies, csrfToken, payload, referer = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const data = JSON.stringify(payload);
        
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'Cookie': cookies,
            'csrf-token': csrfToken,
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Priority': 'u=1, i',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
        };
        
        if (referer) {
            headers['Referer'] = referer;
        }
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: headers
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            let stream = res;
            
            // Handle compressed responses
            const encoding = res.headers['content-encoding'];
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
                stream = res.pipe(zlib.createBrotliDecompress());
            }
            
            stream.on('data', (chunk) => {
                responseData += chunk;
            });
            
            stream.on('end', () => {
                try {
                    const jsonData = JSON.parse(responseData);
                    resolve(jsonData);
                } catch (e) {
                    resolve(responseData);
                }
            });
            
            stream.on('error', (error) => {
                reject(error);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

// Helper function to make GET request
function makeGetRequest(url, cookies, csrfToken, referer = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const headers = {
            'Cookie': cookies,
            'csrf-token': csrfToken,
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Priority': 'u=1, i',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
        };
        const bearer = extractBearerFromCookies(cookies);
        if (bearer) {
            headers['Authorization'] = bearer;
        }
        
        if (referer) {
            headers['Referer'] = referer;
        }
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: headers
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            let stream = res;
            
            // Handle compressed responses
            const encoding = res.headers['content-encoding'];
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
                stream = res.pipe(zlib.createBrotliDecompress());
            }
            
            stream.on('data', (chunk) => {
                responseData += chunk;
            });
            
            stream.on('end', () => {
                try {
                    const jsonData = JSON.parse(responseData);
                    resolve(jsonData);
                } catch (e) {
                    resolve(responseData);
                }
            });
            
            stream.on('error', (error) => {
                reject(error);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

// Recursive function to find all objects that might be courses
function findCoursesRecursive(obj, courses = [], visited = new Set()) {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) {
        return courses;
    }
    visited.add(obj);
    
    // Check if this object looks like a course
    if (obj.slug || obj.name || obj.courseId) {
        // Check if it has a 'me' property (user enrollment info)
        if (obj.me && typeof obj.me === 'object') {
            const isRegistered = obj.me.registered !== false;
            const hasPremium = obj.me.premium !== null;
            
            // Only add if registered and has premium
            if (isRegistered && hasPremium) {
                const courseSlug = obj.slug || obj.name || obj.courseId;
                // Avoid duplicates
                if (!courses.find(c => (c.slug === courseSlug || c.id === obj.id))) {
                    courses.push({
                        name: obj.name || obj.title || obj.slug || `Course ${courses.length + 1}`,
                        slug: obj.slug || obj.name || obj.courseId,
                        id: obj.id || obj._id,
                        courseId: obj.courseId,
                        me: obj.me
                    });
                }
            }
        }
    }
    
    // Recursively search through all properties
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            if (Array.isArray(value)) {
                value.forEach(item => findCoursesRecursive(item, courses, visited));
            } else if (value && typeof value === 'object') {
                findCoursesRecursive(value, courses, visited);
            }
        }
    }
    
    return courses;
}

// Function to extract courses from notifications response
function extractCourses(response) {
    const courses = [];
    
    // Method 1: Check if response has sections with courses
    if (response.sections && Array.isArray(response.sections)) {
        response.sections.forEach((section) => {
            if (section.courses && Array.isArray(section.courses)) {
                section.courses.forEach((course) => {
                    if (course.me) {
                        const isRegistered = course.me.registered !== false;
                        const hasPremium = course.me.premium !== null;
                        
                        if (isRegistered && hasPremium) {
                            courses.push({
                                name: course.title || course.name || course.slug || `Course ${courses.length + 1}`,
                                slug: course.identifiers?.slug || course.slug || course.name,
                                id: course.id,
                                me: course.me
                            });
                        }
                    }
                });
            }
        });
    }
    
    // Method 2: Check if courses is an object (keyed by course ID)
    if (response.courses && typeof response.courses === 'object' && !Array.isArray(response.courses)) {
        Object.values(response.courses).forEach((course) => {
            if (course && typeof course === 'object') {
                // Check if user is registered and has premium access
                if (course.me) {
                    const isRegistered = course.me.registered !== false;
                    const hasPremium = course.me.premium !== null;
                    
                    // Only show if registered and has premium
                    if (isRegistered && hasPremium) {
                        const courseSlug = course.identifiers?.slug || course.slug || course.titleId || course.id;
                        if (!courses.find(c => c.slug === courseSlug || c.id === course.id)) {
                            courses.push({
                                name: course.title || course.name || courseSlug || `Course ${courses.length + 1}`,
                                slug: courseSlug,
                                id: course.id,
                                me: course.me
                            });
                        }
                    }
                }
            }
        });
    }
    
    // Method 3: Check if courses is an array
    if (response.courses && Array.isArray(response.courses)) {
        response.courses.forEach((course) => {
            if (course.me) {
                const isRegistered = course.me.registered !== false;
                const hasPremium = course.me.premium !== null;
                
                if (isRegistered && hasPremium) {
                    const courseSlug = course.identifiers?.slug || course.slug || course.name;
                    if (!courses.find(c => c.slug === courseSlug || c.id === course.id)) {
                        courses.push({
                            name: course.title || course.name || course.slug || `Course ${courses.length + 1}`,
                            slug: courseSlug,
                            id: course.id,
                            me: course.me
                        });
                    }
                }
            }
        });
    }
    
    // Method 4: If still no courses found, show all premium courses (for debugging/selection)
    if (courses.length === 0 && response.courses && typeof response.courses === 'object' && !Array.isArray(response.courses)) {
        console.log('No registered courses found. Showing all available premium courses...\n');
        Object.values(response.courses).forEach((course) => {
            if (course && course.premium === true) {
                const courseSlug = course.identifiers?.slug || course.slug || course.titleId || course.id;
                if (!courses.find(c => c.slug === courseSlug || c.id === course.id)) {
                    courses.push({
                        name: course.title || course.name || courseSlug || `Course ${courses.length + 1}`,
                        slug: courseSlug,
                        id: course.id,
                        me: course.me || { registered: false, premium: null },
                        isAvailable: true
                    });
                }
            }
        });
    }
    
    // Method 5: Recursive search if still no courses found
    if (courses.length === 0) {
        const foundCourses = findCoursesRecursive(response);
        courses.push(...foundCourses);
    }
    
    return courses;
}

// Function to organize course content from API response
function organizeCourseContent(courseResponse, courseSlug) {
    console.log('\n=== DEBUGGING COURSE STRUCTURE ===');
    console.log('Root level keys:', Object.keys(courseResponse).slice(0, 20));
    
    const videos = [];
    const pdfs = [];
    
    // Get course data
    const course = courseResponse.course || courseResponse;
    console.log('Course object keys:', course ? Object.keys(course).slice(0, 20) : 'No course object');
    
    const sections = course.sections || {};
    console.log(`Found ${Object.keys(sections).length} sections`);
    
    // Units are stored INSIDE the course object - build unit data map
    const unitDataMap = {};
    const knownKeys = ['title', 'titleId', 'courseType', 'status', 'tags', 'description', 'keywords', 'goals', 'points', 'authors', 'quotes', 'order', 'courseImage', 'bgcolor', 'price', 'discountFlag', 'discountPrice', 'introVideoImage', 'introVideoVimeoId', 'knowledgeBadges', 'dripFeed', 'goalTotal', 'numVideos', 'numPages', 'difficulty', 'prerequisites', 'socialMedia', 'access', 'registeredUsers', 'inProducts', 'expires', 'expiresType', 'short_url', 'afterPurchase', 'enrollButtonAllOptions', 'courseCompletion', 'courseNavigation', 'coursePlayerSettings', 'unitCompletion', 'unitCompletion_v2', 'disablePathPlayer', 'identifiers', 'courseNotificationSettings', 'denormalizedUnitDataMap', 'trialLimitExceeded', 'created', 'modified', 'customMetadata', 'user', 'readOnlyLocks', 'contentHash', 'id', 'containsLegacyUnits', 'containsLiveSessions', 'sections', 'videos', 'assessments', 'postsCount', 'currency'];
    
    // First, check if there's a videos object inside course and add those units
    if (course.videos && typeof course.videos === 'object') {
        const videoKeys = Object.keys(course.videos);
        console.log(`Found 'videos' object inside course with ${videoKeys.length} entries`);
        videoKeys.forEach(unitId => {
            const unit = course.videos[unitId];
            if (unit && unit.id) {
                unitDataMap[unit.id] = unit;
            }
        });
    } else {
        console.log('No "videos" object found inside course');
    }
    
    // Then, check all keys inside the course object for units (PDFs and other types)
    let courseLevelUnitsFound = 0;
    let skippedKeys = [];
    let pdfUnitsFound = 0;
    let objectIdKeysFound = 0;
    let objectIdKeysWithObjectType = 0;
    
    Object.keys(course).forEach(key => {
        const isObjectIdFormat = /^[a-f0-9]{24}$/i.test(key);
        
        if (isObjectIdFormat) {
            objectIdKeysFound++;
            const obj = course[key];
            // Debug first few ObjectId keys
            if (objectIdKeysFound <= 5) {
                console.log(`  Found ObjectId key: ${key}, type: ${typeof obj}, has objectType: ${obj?.objectType}`);
            }
        }
        
        // Skip known non-unit keys
        if (knownKeys.includes(key)) {
            skippedKeys.push(key);
            return;
        }
        
        const obj = course[key];
        
        if (obj && typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
            // Check if this is a unit object
            // If key is ObjectId format (24 hex chars) AND object has objectType, it's a unit
            if (isObjectIdFormat && obj.objectType) {
                objectIdKeysWithObjectType++;
                // Use the id from object if it exists and matches key, otherwise use key
                const unitId = (obj.id && obj.id === key) ? obj.id : key;
                unitDataMap[unitId] = obj;
                courseLevelUnitsFound++;
                if (obj.objectType === 'pdf') {
                    pdfUnitsFound++;
                }
            } else if (obj.objectType && obj.id) {
                // Object has objectType and id - check if key matches id
                if (key === obj.id || isObjectIdFormat) {
                    unitDataMap[obj.id] = obj;
                    courseLevelUnitsFound++;
                    if (obj.objectType === 'pdf') {
                        pdfUnitsFound++;
                    }
                }
            }
        }
    });
    
    console.log(`Debug: Found ${objectIdKeysFound} ObjectId-format keys, ${objectIdKeysWithObjectType} with objectType`);
    
    console.log(`Skipped keys (first 10): ${skippedKeys.slice(0, 10).join(', ')}...`);
    console.log(`Found ${Object.keys(unitDataMap).length} total units in data map (${courseLevelUnitsFound} from course object, ${pdfUnitsFound} PDFs)`);
    
    // Show sample unit types
    const unitTypes = {};
    Object.values(unitDataMap).forEach(unit => {
        const type = unit.objectType || 'unknown';
        unitTypes[type] = (unitTypes[type] || 0) + 1;
    });
    console.log('Unit types found:', unitTypes);
    
    // Debug: Check if any PDFs are in the map
    const pdfsInMap = Object.values(unitDataMap).filter(u => u.objectType === 'pdf');
    console.log(`PDFs found in unitDataMap: ${pdfsInMap.length}`);
    if (pdfsInMap.length > 0) {
        console.log('Sample PDF from map:', {
            id: pdfsInMap[0].id,
            title: pdfsInMap[0].title,
            objectType: pdfsInMap[0].objectType,
            hasData: !!pdfsInMap[0].data,
            pdfName: pdfsInMap[0].data?.pdf_name || pdfsInMap[0].data?.pdf
        });
    }
    
    // Iterate through sections and their learning paths
    let sectionsProcessed = 0;
    let learningPathItemsProcessed = 0;
    let unitsMatched = 0;
    let unitsNotFound = 0;
    
    Object.keys(sections).forEach((sectionId) => {
        sectionsProcessed++;
        const section = sections[sectionId];
        const learningPath = section.learningPath || [];
        
        learningPath.forEach((item) => {
            learningPathItemsProcessed++;
            const unitId = item.id;
            if (!unitId) {
                console.log(`  ⚠️  Learning path item has no ID in section: ${section.title || sectionId}`);
                return;
            }
            
            // Try to find unit data
            let unitData = unitDataMap[unitId];
            
            // If not found in map, try direct lookup inside course object
            if (!unitData) {
                // Try direct lookup by unitId as key inside course object
                if (course[unitId] && typeof course[unitId] === 'object' && course[unitId].objectType) {
                    unitData = course[unitId];
                    unitDataMap[unitId] = unitData;
                    console.log(`  ✓ Found unit ${unitId} via direct course lookup`);
                } else {
                    // Try to find in videos object inside course
                    if (course.videos && course.videos[unitId]) {
                        unitData = course.videos[unitId];
                        unitDataMap[unitId] = unitData;
                        console.log(`  ✓ Found unit ${unitId} in course.videos object`);
                    }
                }
            }
            
            if (!unitData) {
                unitsNotFound++;
                if (unitsNotFound <= 5) {
                    console.log(`  ✗ Unit data not found for ID: ${unitId} (type: ${item.type}, section: ${section.title || sectionId})`);
                }
                return;
            }
            
            unitsMatched++;
            
            const contentItem = {
                id: unitId,
                title: unitData.title || item.unitTitle || 'Untitled',
                section: section.title || sectionId,
                sectionId: sectionId,
                type: unitData.objectType || item.type,
                order: item.order || 0
            };
            
            if (unitData.objectType === 'pdf' || item.type === 'pdf') {
                // PDF content
                const pdfData = unitData.data || {};
                contentItem.sourceId = unitData.sourceid || unitId;
                contentItem.pdfName = pdfData.pdf_name || pdfData.pdf || '';
                contentItem.pdfPath = pdfData.pdf || '';
                contentItem.courseSection = unitData.courseSection || sectionId;
                
                // Debug if pdfName is missing
                if (!contentItem.pdfName) {
                    console.log(`  ⚠️  PDF ${unitId} (${contentItem.title}) has no pdfName. Data:`, JSON.stringify(pdfData).substring(0, 100));
                }
                
                pdfs.push(contentItem);
            } else if (unitData.objectType === 'ivideo' || item.type === 'ivideo') {
                // Video content
                contentItem.sourceId = unitData.sourceid || unitId;
                contentItem.duration = unitData.duration || 0;
                contentItem.videoType = unitData.type || 'wistia';
                videos.push(contentItem);
            }
        });
    });
    
    console.log(`\n=== PROCESSING SUMMARY ===`);
    console.log(`Sections processed: ${sectionsProcessed}`);
    console.log(`Learning path items processed: ${learningPathItemsProcessed}`);
    console.log(`Units matched: ${unitsMatched}`);
    console.log(`Units not found: ${unitsNotFound}`);
    
    // Sort by ID to arrange them properly (contentHash equivalent)
    videos.sort((a, b) => a.id.localeCompare(b.id));
    pdfs.sort((a, b) => a.id.localeCompare(b.id));
    
    console.log(`\n=== FINAL RESULTS ===`);
    console.log(`Extracted ${videos.length} videos and ${pdfs.length} PDFs`);
    
    if (videos.length > 0) {
        console.log('\nSample videos:');
        videos.slice(0, 3).forEach(v => console.log(`  - ${v.title} (${v.id})`));
    }
    
    if (pdfs.length > 0) {
        console.log('\nSample PDFs:');
        pdfs.slice(0, 3).forEach(p => console.log(`  - ${p.title} (${p.id})`));
    }
    
    return {
        courseSlug: courseSlug,
        courseTitle: course.title || courseSlug,
        videos: videos.map(v => ({ 
            title: v.title, 
            url: `https://fast.wistia.com/embed/medias/${v.sourceId}.m3u8`
        })),
        pdfs: pdfs, // Keep full PDF data for separate file
        totalVideos: videos.length,
        totalPDFs: pdfs.length
    };
}

// Function to remove watermark from PDF using Python script
async function removeWatermark(pdfPath) {
    try {
        // Get the directory and filename
        const dir = path.dirname(pdfPath);
        const filename = path.basename(pdfPath, '.pdf');
        const tempOutputPath = path.join(dir, `${filename}_temp_cleaned.pdf`);
        
        // Get the Python script path (same directory as script.js)
        const scriptDir = __dirname;
        const pythonScript = path.join(scriptDir, 'advanced_watermark_removal.py');
        
        // Execute Python script (try python3 first, then python)
        let command = `python3 "${pythonScript}" "${pdfPath}" "${tempOutputPath}"`;
        
        try {
            let { stdout, stderr } = await execPromise(command);
            if (stdout) {
                console.log(`    ${stdout.trim()}`);
            }
            if (stderr && !stderr.includes('Removed watermark') && !stderr.includes('Created cleaned PDF')) {
                console.log(`    Python script warning: ${stderr}`);
            }
            
            // Check if output file was created
            if (fs.existsSync(tempOutputPath)) {
                // Replace original with cleaned version
                fs.unlinkSync(pdfPath);
                fs.renameSync(tempOutputPath, pdfPath);
                console.log(`    ✓ Watermark removed, cleaned PDF saved`);
                return true;
            } else {
                console.log(`    ⚠️  Output file not created`);
                return false;
            }
        } catch (execError) {
            // Try with 'python' if 'python3' fails
            try {
                command = `python "${pythonScript}" "${pdfPath}" "${tempOutputPath}"`;
                const { stdout, stderr } = await execPromise(command);
                if (stdout) {
                    console.log(`    ${stdout.trim()}`);
                }
                if (stderr && !stderr.includes('Removed watermark') && !stderr.includes('Created cleaned PDF')) {
                    console.log(`    Python script warning: ${stderr}`);
                }
                
                if (fs.existsSync(tempOutputPath)) {
                    // Replace original with cleaned version
                    fs.unlinkSync(pdfPath);
                    fs.renameSync(tempOutputPath, pdfPath);
                    console.log(`    ✓ Watermark removed, cleaned PDF saved`);
                    return true;
                } else {
                    console.log(`    ⚠️  Output file not created`);
                    return false;
                }
            } catch (secondError) {
                console.log(`    ⚠️  Python script error: ${secondError.message}`);
                return false;
            }
        }
    } catch (error) {
        console.log(`    ⚠️  Watermark removal failed: ${error.message}`);
        return false;
    }
}

// Function to download a file
function downloadFile(url, filepath, cookies, csrfToken) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        let file = fs.createWriteStream(filepath);
        
        const headers = {
            'Cookie': cookies,
            'csrf-token': csrfToken,
            'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
        };
        const bearer = extractBearerFromCookies(cookies);
        if (bearer) {
            headers['Authorization'] = bearer;
        }
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + (urlObj.search || ''),
            method: 'GET',
            headers: headers
        };
        
        const req = https.request(options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                // Handle redirect
                file.close();
                fs.unlinkSync(filepath);
                const location = res.headers.location || '';
                const nextUrl = location.startsWith('http')
                    ? location
                    : `${urlObj.protocol}//${urlObj.host}${location}`;
                return downloadFile(nextUrl, filepath, cookies, csrfToken)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(filepath);
                return reject(new Error(`Failed to download: ${res.statusCode}`));
            }
            // Validate content-type is a PDF
            const contentType = (res.headers['content-type'] || '').toLowerCase();
            const contentDisposition = (res.headers['content-disposition'] || '').toLowerCase();
            const isPdfType = contentType.includes('application/pdf');
            const isOctet = contentType.includes('application/octet-stream');
            const hasPdfFilename = contentDisposition.includes('filename=') && contentDisposition.includes('.pdf');
            const isPdf = isPdfType || isOctet || hasPdfFilename || url.toLowerCase().endsWith('.pdf');
            if (!isPdf) {
                // Buffer response to string and save as .error.txt for debugging
                let responseData = '';
                let streamErr = res;
                const enc = res.headers['content-encoding'];
                if (enc === 'gzip') streamErr = res.pipe(zlib.createGunzip());
                else if (enc === 'deflate') streamErr = res.pipe(zlib.createInflate());
                else if (enc === 'br') streamErr = res.pipe(zlib.createBrotliDecompress());
                streamErr.on('data', chunk => { responseData += chunk; });
                streamErr.on('end', () => {
                    try { file.close(); } catch (_) {}
                    if (fs.existsSync(filepath)) {
                        try { fs.unlinkSync(filepath); } catch (_) {}
                    }
                    const errorPath = filepath.replace(/\.pdf$/i, '') + '.error.txt';
                    fs.writeFileSync(errorPath, responseData || 'Non-PDF response');
                    return reject(new Error(`Non-PDF response (${contentType || 'unknown content-type'})`));
                });
                streamErr.on('error', (e) => {
                    try { file.close(); } catch (_) {}
                    if (fs.existsSync(filepath)) {
                        try { fs.unlinkSync(filepath); } catch (_) {}
                    }
                    return reject(e);
                });
                return;
            }

            let stream = res;
            const encoding = res.headers['content-encoding'];
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
                stream = res.pipe(zlib.createBrotliDecompress());
            }
            
            stream.pipe(file);
            
            stream.on('error', (error) => {
                file.close();
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(error);
            });
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
            
            file.on('error', (error) => {
                stream.destroy();
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(error);
            });
        });
        
        req.on('error', (error) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(error);
        });
        
        req.end();
    });
}

// Function to ask user question
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// Main function
async function main() {
    try {
        console.log('=== Apna College Course Fetcher ===\n');
        
        // Step 1: Get cookies and CSRF token from user
        console.log('Enter your cookies (from browser dev tools):');
        const cookies = await askQuestion('Cookies: ');
        
        if (!cookies || cookies.trim() === '') {
            console.log('Error: Cookies are required!');
            rl.close();
            return;
        }
        
        console.log('\nEnter your CSRF token (from browser dev tools, header: csrf-token):');
        const csrfToken = await askQuestion('CSRF Token: ');
        
        if (!csrfToken || csrfToken.trim() === '') {
            console.log('Error: CSRF token is required!');
            rl.close();
            return;
        }
        
        console.log('\nFetching notifications...\n');
        
        // Step 2: Make POST request to notifications API
        const payload = {
            "page": "start",
            "pageId": "62a852db09989a9cb707838f",
            "pageUrl": "/start",
            "context": [],
            "me": true,
            "inactive": false,
            "courseId": null,
            "bundleId": null,
            "subscriptionId": null,
            "siteTemplateId": "62a852db09989a9cb7078387",
            "trackingCodes": {
                "gtag_client_id": "",
                "_fbp": "",
                "_fbc": ""
            },
            "gtag_client_id": ""
        };
        
        const notificationsResponse = await makePostRequest(
            'https://www.apnacollege.in/api/notifications',
            cookies,
            csrfToken,
            payload,
            'https://www.apnacollege.in/'
        );
        
        // Debug: Show response structure
        console.log('Response keys:', Object.keys(notificationsResponse));
        if (notificationsResponse.sections) {
            console.log('Sections found:', notificationsResponse.sections.length);
        }
        if (notificationsResponse.courses) {
            console.log('Courses found:', notificationsResponse.courses.length);
        }
        console.log('');
        
        // Step 3: Extract and filter courses
        const availableCourses = extractCourses(notificationsResponse);
        
        console.log(`Extracted ${availableCourses.length} paid courses\n`);
        
        if (availableCourses.length === 0) {
            console.log('No paid courses found.');
            rl.close();
            return;
        }
        
        // Step 4: Display courses and let user select
        console.log('Available Courses:\n');
        availableCourses.forEach((course, index) => {
            console.log(`${index + 1}. ${course.name} (${course.slug})`);
        });
        
        const selectedIndex = await askQuestion(`\nSelect a course (1-${availableCourses.length}): `);
        const courseIndex = parseInt(selectedIndex) - 1;
        
        if (isNaN(courseIndex) || courseIndex < 0 || courseIndex >= availableCourses.length) {
            console.log('Invalid selection!');
            rl.close();
            return;
        }
        
        const selectedCourse = availableCourses[courseIndex];
        console.log(`\nFetching course content for: ${selectedCourse.name}...\n`);
        
        // Step 5: Fetch course content
        const courseUrl = `https://www.apnacollege.in/api/course/${selectedCourse.slug}?contents&path-player`;
        const refererUrl = `https://www.apnacollege.in/path-player?courseid=${selectedCourse.slug}&unit=66215f810464798c980bc538Unit`;
        const courseResponse = await makeGetRequest(courseUrl, cookies, csrfToken, refererUrl);
        
        // Step 6: Organize and extract content
        console.log('\nOrganizing course content...\n');
        const organizedContent = organizeCourseContent(courseResponse, selectedCourse.slug);
        
        // Step 8: Save organized content (VIDEOS ONLY)
        const organizedFilename = `organized_${selectedCourse.slug}_${Date.now()}.json`;
        const organizedData = {
            courseSlug: organizedContent.courseSlug,
            courseTitle: organizedContent.courseTitle,
            videos: organizedContent.videos,
            totalVideos: organizedContent.totalVideos
        };
        fs.writeFileSync(organizedFilename, JSON.stringify(organizedData, null, 2));
        console.log(`\nOrganized content (videos only) saved to: ${organizedFilename}`);
        
        // Step 9: Extract PDFs directly from course response
        console.log(`\n=== PDF Processing ===`);
        
        const pdfData = {};
        let pdfCount = 0;
        
        try {
            const savedCourse = courseResponse.course || courseResponse;
            
            // Recursive function to find all PDFs in the JSON structure
            function findAllPDFs(obj, visited = new Set()) {
                if (!obj || typeof obj !== 'object' || visited.has(obj)) {
                    return;
                }
                visited.add(obj);
                
                // Check if this object is a PDF
                if (obj.objectType === 'pdf' && obj.data && obj.data.pdf_name && obj.data.pdf_full && obj.id) {
                    const unitId = obj.id;
                    const pdfName = obj.data.pdf_name;
                    const pdfUrl = obj.data.pdf_full;
                    
                    // Avoid duplicates
                    if (!pdfData[unitId]) {
                        pdfData[unitId] = `${pdfName}unlockedcoding.com${pdfUrl}`;
                        pdfCount++;
                        
                        if (pdfCount <= 3) {
                            console.log(`  ✓ ${unitId}: ${pdfName}`);
                        }
                    }
                    return;
                }
                
                // Recursively search through all properties
                if (Array.isArray(obj)) {
                    obj.forEach(item => findAllPDFs(item, visited));
                } else {
                    Object.keys(obj).forEach(key => {
                        if (obj[key] && typeof obj[key] === 'object') {
                            findAllPDFs(obj[key], visited);
                        }
                    });
                }
            }
            
            // Find all PDFs in the course structure
            findAllPDFs(savedCourse);
            
            console.log(`Extracted ${pdfCount} PDFs`);
            
        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
        
        // Sort by unitId
        const sortedPdfData = {};
        Object.keys(pdfData).sort().forEach(key => {
            sortedPdfData[key] = pdfData[key];
        });
        
        console.log(`  Total PDFs: ${pdfCount}`);
        
        // Ask user if they want to download PDFs
        const downloadPdfAnswer = await askQuestion(`\nDo you want to download all PDFs? (yes/no): `);
        if (downloadPdfAnswer && downloadPdfAnswer.toLowerCase().trim() === 'yes') {
            console.log(`\n=== Downloading PDFs ===`);
            console.log(`Note: Watermarks will be automatically removed after download.\n`);
            
            // Extract PDFs from sortedPdfData for downloading
            const pdfsToDownload = [];
            Object.keys(sortedPdfData).forEach(unitId => {
                const pdfString = sortedPdfData[unitId];
                // Parse pdfName and pdfUrl from the string format: "pdfNameunlockedcoding.compdfUrl"
                const parts = pdfString.split('unlockedcoding.com');
                if (parts.length === 2) {
                    pdfsToDownload.push({
                        id: unitId,
                        pdfName: parts[0],
                        pdfUrl: parts[1],
                        title: parts[0] // Use pdfName as title
                    });
                } else {
                    console.log(`  ⚠️  Could not parse PDF string for ${unitId}: ${pdfString.substring(0, 100)}`);
                }
            });
            
            // Create PDFs directory
            const pdfDir = `pdfs_${selectedCourse.slug}`;
            if (!fs.existsSync(pdfDir)) {
                fs.mkdirSync(pdfDir, { recursive: true });
            }
            
            // Download all PDFs
            for (let i = 0; i < pdfsToDownload.length; i++) {
                const pdf = pdfsToDownload[i];
                console.log(`[${i + 1}/${pdfsToDownload.length}] Downloading: ${pdf.pdfName}`);
                
                try {
                    // Sanitize filename
                    let safeTitle = pdf.pdfName.replace(/[<>:"/\\|?*]/g, '_');
                    // Remove .pdf extension if already present to avoid double extension
                    if (safeTitle.toLowerCase().endsWith('.pdf')) {
                        safeTitle = safeTitle.slice(0, -4);
                    }
                    // Use only pdfName without ID prefix
                    const filename = `${safeTitle}.pdf`;
                    const filepath = path.join(pdfDir, filename);
                    
                    // Download the PDF (will follow redirects automatically)
                    await downloadFile(pdf.pdfUrl, filepath, cookies, csrfToken);
                    console.log(`  ✓ Downloaded: ${filename}`);
                    
                    // Remove watermark
                    console.log(`    Removing watermark...`);
                    const removed = await removeWatermark(filepath);
                    if (removed) {
                        console.log(`    ✓ Watermark removed`);
                    }
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    console.log(`  ✗ Error: ${error.message}`);
                }
            }
            
            console.log(`\nPDFs saved to: ${pdfDir}/`);
        }
        
        // Display summary
        console.log(`\n=== Summary ===`);
        console.log(`Videos: ${organizedContent.videos.length}`);
        console.log(`PDFs: ${pdfCount}`);
        console.log(`Total content items: ${organizedContent.videos.length + pdfCount}`);
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        rl.close();
    }
}

// Run the script
main();

