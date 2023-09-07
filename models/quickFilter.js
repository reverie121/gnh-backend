"use strict";

const db = require("../db");
const { sqlForPartialUpdate } = require("../helpers/sql");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

/** Related functions for users. */

class QuickFilter {

  /** Add new Quick Filter with data.
   *
   * Returns { id, username, filter_name, filter_settings }
   *
   * Throws BadRequestError on duplicates (same filter name and username).
   **/

    static async add({ username, filterName, filterSettings }) {

        const duplicateCheck = await db.query(
            `SELECT username, filter_name
             FROM quick_filters
             WHERE username = $1
             AND filter_name = $2`,
          [username, filterName],
        );

        if (duplicateCheck.rows[0]) {
            throw new BadRequestError(`Duplicate filter name: ${filterName}`);
        };

        const result = await db.query(
            `INSERT INTO quick_filters 
             (username,
              filter_name,
              filter_settings)
             VALUES ($1, $2, $3)
             RETURNING id, username, filter_name AS "filterName", filter_settings AS "filterSettings"`,
          [
            username,
            filterName,
            filterSettings, 
          ],
      );
  
      const filter = result.rows[0];
  
      return filter;
    };

  /** Find all Quick Filters.
   *
   * Returns [{ id, username, filter_name, filter_settings }, ...]
   **/

    static async findAll() {
        const result = await db.query(
            `SELECT id,
                    username, 
                    filter_name AS "filterName",
                    filter_settings AS "filterSettings"
             FROM quick_filters
             ORDER BY id`,
      );
  
      return result.rows;
    };

  /** Given a username, returns all Quick Filters for that user.
   *
   * Returns [{ id, username, filter_name, filter_settings }, ...]
   **/

    static async getAllForUser(username) {
        const result = await db.query(
            `SELECT id,
                    username, 
                    filter_name AS "filterName",
                    filter_settings AS "filterSettings"
             FROM quick_filters 
             WHERE username = $1 
             ORDER BY filter_name`,
             [username],
      );
  
      return result.rows;
    };

  /** Given a Quick Filter id, return data for Quick Filter.
   *
   * Returns { id, username, filter_name, filter_settings }
   *
   * Throws NotFoundError if filter not found.
   **/

    static async get(id) {
        const result = await db.query(
            `SELECT id,
                username, 
                filter_name AS "filterName",
                filter_settings AS "filterSettings"
            FROM quick_filters 
            WHERE id = $1`,
          [id],
        );
        const filter = result.rows[0];
    
        if (!filter) throw new NotFoundError(`ID not found: ${id}`);
    
        return filter;
    };

  /** Update Quick Filter data with `data`.
   *
   * This is a "partial update" --- it's fine if data doesn't contain
   * all the fields; this only changes provided ones. 
   * 
   * ID is required but cannot be changed.
   *
   * Data can include:
   *   { id, username, filter_name, filter_settings }
   *
   * Returns { id, username, filter_name, filter_settings }
   *
   * Throws NotFoundError if not found.
   */

    static async update(id, data) {

        const { setCols, values } = sqlForPartialUpdate(
            data,
            {
            filterName: "filter_name",
            filterSettings: "filter_settings",
            });
        const filterIdVarIdx = "$" + (values.length + 1);
    
        const querySql = `UPDATE quick_filters 
                        SET ${setCols} 
                        WHERE id = ${filterIdVarIdx} 
                        RETURNING id, username, filter_name AS "filterName", filter_settings AS "filterSettings"`;
        const result = await db.query(querySql, [...values, id]);
        const filter = result.rows[0];
    
        if (!filter) throw new NotFoundError(`ID not found: ${id}`);
    
        return filter;
        
    };

  /** Delete given Quick Filter from database; returns undefined. */

    static async remove(id) {
        let result = await db.query(
            `DELETE
            FROM quick_filters
            WHERE id = $1
            RETURNING id`,
            [id],
        );
        const res = result.rows[0];

        if (!res) throw new NotFoundError(`ID not found: ${id}`);
    };    

}


module.exports = QuickFilter;
