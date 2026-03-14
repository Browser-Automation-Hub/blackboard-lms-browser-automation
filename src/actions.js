/**
 * actions.js — Core automation actions for Blackboard LMS
 *
 * Each function accepts a Puppeteer Page instance and options.
 * All actions use retry() + humanDelay() for reliability.
 */
'use strict';

require('dotenv').config();

/**
 * login_blackboard — Authenticate to Blackboard with SSO/MFA
 * @param {import('puppeteer').Page} page
 * @param {Object} opts
 * @returns {Promise<Object>}
 */
async function login_blackboard(page, opts = {}) {
  const { retry, humanDelay, log } = require('./utils');

  log('Running: login_blackboard', opts);

  return retry(async () => {
    await humanDelay(500, 1500);
    try {
      const BASE_URL = process.env.BLACKBOARD_URL;
    await page.goto(`${BASE_URL}/webapps/login/`, { waitUntil: 'networkidle2' });
    // Handle SSO redirect (CAS/Shibboleth) or native login
    if (page.url().includes('cas') || page.url().includes('shibboleth') || page.url().includes('saml')) {
      await page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 15000 });
      await page.type('input[type="text"], input[type="email"]', process.env.BLACKBOARD_USERNAME);
      await page.type('input[type="password"]', process.env.BLACKBOARD_PASSWORD);
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      // Duo MFA handling
      const duoFrame = page.frames().find(f => f.url().includes('duo'));
      if (duoFrame) {
        await duoFrame.waitForSelector('button#trust-browser-button, [data-form-type="push"]', { timeout: 5000 }).catch(() => {});
        const pushBtn = await duoFrame.$('[data-form-type="push"]');
        if (pushBtn) { await pushBtn.click(); await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }); }
      }
    } else {
      await page.waitForSelector('#user_id, input[name="user_id"]');
      await page.type('#user_id', process.env.BLACKBOARD_USERNAME);
      await page.type('#password', process.env.BLACKBOARD_PASSWORD);
      await page.click('#entry-login, input[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    }
    await page.waitForSelector('#topframe, .base-layout, #navigationPane', { timeout: 20000 });
    return { status: 'logged_in' };
    } catch (err) {
      await page.screenshot({ path: `error-login_blackboard-${Date.now()}.png` }).catch(() => {});
      throw err;
    }
  }, { attempts: 3, delay: 2000 });
}

/**
 * enroll_students — Bulk enroll students into courses
 * @param {import('puppeteer').Page} page
 * @param {Object} opts
 * @returns {Promise<Object>}
 */
async function enroll_students(page, opts = {}) {
  const { retry, humanDelay, log } = require('./utils');

  log('Running: enroll_students', opts);

  return retry(async () => {
    await humanDelay(500, 1500);
    try {
      // TODO: Replace with actual Blackboard LMS selectors
    // await page.goto(`${process.env.BLACKBOARD_URL}/path/to/enroll-students`);
    // await page.waitForSelector('.main-content, #content, [data-testid="loaded"]', { timeout: 15000 });
    const result = await page.evaluate(() => {
      return { status: 'ok', data: null };
    });
    log('enroll_students complete', result);
    return result;
    } catch (err) {
      await page.screenshot({ path: `error-enroll_students-${Date.now()}.png` }).catch(() => {});
      throw err;
    }
  }, { attempts: 3, delay: 2000 });
}

/**
 * post_grades — Upload grade data to grade center
 * @param {import('puppeteer').Page} page
 * @param {Object} opts
 * @returns {Promise<Object>}
 */
async function post_grades(page, opts = {}) {
  const { retry, humanDelay, log } = require('./utils');

  log('Running: post_grades', opts);

  return retry(async () => {
    await humanDelay(500, 1500);
    try {
      const BASE_URL = process.env.BLACKBOARD_URL;
    const courseId = opts.courseId;
    await page.goto(`${BASE_URL}/webapps/gradebook/do/instructor/enterGradeCenter?course_id=${courseId}&numColumns=0&returnToGC=false&useRecipientList=false`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#gradebookgrid, .gradebook-cell, .Grade_Cell', { timeout: 20000 });
    const grades = opts.grades || []; // [{studentId, columnId, grade}]
    for (const {studentId, columnId, grade} of grades) {
      const cellSel = `[id*="${studentId}"][id*="${columnId}"], .grade-cell[data-student="${studentId}"][data-column="${columnId}"]`;
      const cell = await page.$(cellSel);
      if (cell) {
        await cell.click();
        await cell.dblclick();
        await page.waitForSelector('input.editBoxStyle, input[id*="grade_input"]', { timeout: 3000 });
        const input = await page.$('input.editBoxStyle, input[id*="grade_input"]');
        if (input) {
          await input.click({ clickCount: 3 });
          await input.type(String(grade));
          await input.press('Tab');
        }
      }
    }
    const saveBtn = await page.$('input[value="Save Changes"], .submit_button');
    if (saveBtn) await saveBtn.click();
    return { status: 'ok', gradesPosted: grades.length };
    } catch (err) {
      await page.screenshot({ path: `error-post_grades-${Date.now()}.png` }).catch(() => {});
      throw err;
    }
  }, { attempts: 3, delay: 2000 });
}

/**
 * download_submissions — Download all assignment submissions
 * @param {import('puppeteer').Page} page
 * @param {Object} opts
 * @returns {Promise<Object>}
 */
async function download_submissions(page, opts = {}) {
  const { retry, humanDelay, log } = require('./utils');

  log('Running: download_submissions', opts);

  return retry(async () => {
    await humanDelay(500, 1500);
    try {
      const BASE_URL = process.env.BLACKBOARD_URL;
    const courseId = opts.courseId;
    const assignmentId = opts.assignmentId;
    await page.goto(`${BASE_URL}/webapps/assignment/uploadAssignment?action=listSubmissions&course_id=${courseId}&content_id=${assignmentId}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.attemptCell, .listContainer, [id*="listContainer"]', { timeout: 15000 });
    // Select all submissions
    const selectAll = await page.$('#selectAll, input.bulkCB[value="allUsers"]');
    if (selectAll) await selectAll.click();
    const downloadLink = await page.$('a[href*="downloadAll"], input[value="Download All"]');
    if (downloadLink) await downloadLink.click();
    return { status: 'downloading', courseId, assignmentId };
    } catch (err) {
      await page.screenshot({ path: `error-download_submissions-${Date.now()}.png` }).catch(() => {});
      throw err;
    }
  }, { attempts: 3, delay: 2000 });
}

/**
 * create_announcement — Post course announcements
 * @param {import('puppeteer').Page} page
 * @param {Object} opts
 * @returns {Promise<Object>}
 */
async function create_announcement(page, opts = {}) {
  const { retry, humanDelay, log } = require('./utils');

  log('Running: create_announcement', opts);

  return retry(async () => {
    await humanDelay(500, 1500);
    try {
      // TODO: Replace with actual Blackboard LMS selectors
    // await page.goto(`${process.env.BLACKBOARD_URL}/path/to/create-announcement`);
    // await page.waitForSelector('.main-content, #content, [data-testid="loaded"]', { timeout: 15000 });
    const result = await page.evaluate(() => {
      return { status: 'ok', data: null };
    });
    log('create_announcement complete', result);
    return result;
    } catch (err) {
      await page.screenshot({ path: `error-create_announcement-${Date.now()}.png` }).catch(() => {});
      throw err;
    }
  }, { attempts: 3, delay: 2000 });
}

module.exports = {
  login_blackboard,
  enroll_students,
  post_grades,
  download_submissions,
  create_announcement,
};
